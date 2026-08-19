// tests/integration/updateProfile.test.js
const { createMockDb } = require('../helpers/mock-db.js');
const { updateProfileByOpenid } = require('../../cloudfunctions/updateProfile/index.js');
const { loginWithOpenid } = require('../../cloudfunctions/login/index.js');

const INIT_PATCH = {
  basic: { nickname: '小鱼', gender: '女', birthday: '1995-06-15', constellation: '双子座', signature: '你好' },
};

describe('cloudfunctions/updateProfile', () => {
  test('未登录用户返回错误', async () => {
    const res = await updateProfileByOpenid('openid-x', { about: {} }, createMockDb());
    expect(res.error).toBe('user not found');
  });

  test('首次提交基本资料：写入并置 basicInit=true', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const res = await updateProfileByOpenid('openid-a', INIT_PATCH, db);
    expect(res.error).toBeUndefined();
    expect(res.profile.basicInit).toBe(true);
    expect(res.profile.basic.nickname).toBe('小鱼');
    expect(res.profile.userId).toBeTruthy();
  });

  test('basicInit 后修改昵称被拒绝（basic locked）', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    await updateProfileByOpenid('openid-a', INIT_PATCH, db);
    const res = await updateProfileByOpenid('openid-a', {
      basic: { nickname: '大鱼', gender: '女', birthday: '1995-06-15' },
    }, db);
    expect(res.error).toBe('basic locked');
  });

  test('basicInit 后原值重提 + 修改签名是允许的', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const saved = await updateProfileByOpenid('openid-a', INIT_PATCH, db);
    const res = await updateProfileByOpenid('openid-a', {
      basic: { nickname: '小鱼', gender: '女', birthday: '1995-06-15', signature: '新签名' },
    }, db);
    expect(res.error).toBeUndefined();
    expect(res.profile.basic.signature).toBe('新签名');
    expect(res.profile.basicInit).toBe(true);
  });

  test('patch 含未知顶层字段被拒绝', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const res = await updateProfileByOpenid('openid-a', { role: 'admin' }, db);
    expect(res.error).toBe('invalid patch key: role');
  });

  test('about 段校验：height 非 number 拒绝；familyBackground 超 12 项拒绝', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const bad1 = await updateProfileByOpenid('openid-a', { about: { height: '170' } }, db);
    expect(bad1.error).toBe('invalid about.height');
    const arr13 = Array.from({ length: 13 }, (_, i) => '项' + i);
    const bad2 = await updateProfileByOpenid('openid-a', { about: { familyBackground: arr13 } }, db);
    expect(bad2.error).toBe('invalid about.familyBackground');
  });

  test('about.weight：number 入库、非 number 拒绝（与 height 同型）', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const bad = await updateProfileByOpenid('openid-a', { about: { weight: '50' } }, db);
    expect(bad.error).toBe('invalid about.weight');
    const ok = await updateProfileByOpenid('openid-a', { about: { weight: 50, height: 165 } }, db);
    expect(ok.error).toBeUndefined();
    expect(ok.profile.about.weight).toBe(50);
    expect(ok.profile.about.height).toBe(165);
    const cleared = await updateProfileByOpenid('openid-a', { about: { weight: null } }, db);
    expect(cleared.error).toBeUndefined();
    expect(cleared.profile.about.weight).toBeNull();
  });

  test('album 超 5 项或 category 重复拒绝；合法 album 整段替换', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const six = Array.from({ length: 6 }, (_, i) => ({ category: '类' + i, fileID: 'f' + i }));
    expect((await updateProfileByOpenid('openid-a', { album: six }, db)).error).toBe('invalid album');
    const dup = [
      { category: '日常生活', fileID: 'f1' },
      { category: '日常生活', fileID: 'f2' },
    ];
    expect((await updateProfileByOpenid('openid-a', { album: dup }, db)).error).toBe('duplicate album category');
    const ok = await updateProfileByOpenid('openid-a', {
      album: [{ category: '日常生活', fileID: 'f1' }, { category: '旅行经历', fileID: 'f2' }],
    }, db);
    expect(ok.profile.album).toHaveLength(2);
    // 再提交 1 项：整段替换为 1 项（而非追加）
    const shrink = await updateProfileByOpenid('openid-a', { album: [{ category: '日常生活', fileID: 'f9' }] }, db);
    expect(shrink.profile.album).toEqual([{ category: '日常生活', fileID: 'f9' }]);
  });

  test('stories：topic 缺失/重复拒绝', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    expect((await updateProfileByOpenid('openid-a', {
      stories: [{ topic: '', audioFileID: 'a1' }],
    }, db)).error).toBe('invalid story item');
    expect((await updateProfileByOpenid('openid-a', {
      stories: [{ topic: '我的周末', audioFileID: 'a1' }, { topic: '我的周末', audioFileID: 'a2' }],
    }, db)).error).toBe('duplicate story topic');
  });

  test('tags：未知分类键拒绝；合法 tags 保存', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    expect((await updateProfileByOpenid('openid-a', { tags: { sport: ['跑步'] } }, db)).error)
      .toBe('invalid tags key: sport');
    const ok = await updateProfileByOpenid('openid-a', { tags: { hobby: ['旅行', '美食'] } }, db);
    expect(ok.profile.tags.hobby).toEqual(['旅行', '美食']);
  });

  test('privacy 段保存且入 profiles 文档', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const res = await updateProfileByOpenid('openid-a', {
      privacy: { asset: { house: '有房', car: '' }, contact: { phone: '13800000000', wechat: 'wxid_x' } },
    }, db);
    expect(res.profile.privacy.contact.phone).toBe('13800000000');
  });

  test('首次建档写入 createdAt，再次更新保留原值（P2 列表排序依赖）', async () => {
    const db = createMockDb({ users: { u1: { _id: 'u1', openid: 'o1', role: 'normal', guestNo: 'J0001' } } });
    const first = await updateProfileByOpenid('o1', { basic: { nickname: '小鱼' } }, db);
    expect(first.profile.createdAt).toBeTruthy();
    await new Promise((r) => setTimeout(r, 5)); // 保证时间戳可区分
    const second = await updateProfileByOpenid('o1', { basic: { signature: '新签名' } }, db);
    expect(second.profile.createdAt).toBe(first.profile.createdAt);
    expect(second.profile.updatedAt >= first.profile.updatedAt).toBe(true);
  });
});
