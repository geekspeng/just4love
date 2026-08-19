// tests/integration/listProfiles.test.js —— listProfiles 云函数（注入 mock 数据库）
const { createMockDb } = require('../helpers/mock-db.js');
const { listProfilesByOpenid } = require('../../cloudfunctions/listProfiles/index.js');

const YEAR = new Date().getFullYear();

// 造一份已 basicInit 的 profile（birthday 由年龄反推，随当前年份自适应）
function profile(id, openid, createdAt, patch) {
  return Object.assign({
    _id: id, openid, userId: 'u-' + openid, basicInit: true, createdAt,
    basic: { guestNo: id, nickname: id, gender: '女', birthday: (YEAR - 30) + '-06-15', constellation: '双子座', avatarFileID: '', signature: '' },
    about: { aboutMe: '', aboutYou: '', loveGoal: '', emotionalStatus: '单身未婚', height: 165, weight: null, education: '本科', job: '互联网/IT', city: '广东省 深圳市', hometown: '', school: '', familyBackground: [], smoke: '', drink: '', gamble: '' },
    privacy: { asset: { house: '有房无贷', car: '有车', income: '10-20万' }, contact: { phone: '13800000000', wechat: 'wx-abc' } },
    album: [], stories: [], tags: { hobby: ['旅行'] },
  }, patch);
}

function seed() {
  return createMockDb({
    users: {
      ua: { _id: 'ua', openid: 'o-viewer', role: 'normal', guestNo: 'J0001' },
      ub: { _id: 'ub', openid: 'o-b', role: 'verified', guestNo: 'J0002' },
      uc: { _id: 'uc', openid: 'o-c', role: 'normal', guestNo: 'J0003' },
    },
    profiles: {
      pSelf: profile('pSelf', 'o-viewer', '2026-08-04T00:00:00Z'),
      pB: profile('pB', 'o-b', '2026-08-03T00:00:00Z'),
      pC: profile('pC', 'o-c', '2026-08-01T00:00:00Z', { basicInit: false }), // 未完善 → 不上榜
      pD: profile('pD', 'o-d', '2026-08-02T00:00:00Z', { about: Object.assign({}, profile('x', 'x', '').about, { height: 178, education: '硕士' }) }),
      pE: profile('pE', 'o-e', '2026-08-05T00:00:00Z', { basic: { guestNo: 'pE', nickname: 'pE', gender: '女', birthday: (YEAR - 40) + '-01-01', constellation: '', avatarFileID: '', signature: '' } }),
    },
  });
}

describe('cloudfunctions/listProfiles', () => {
  test('只返回 basicInit 且排除自己；按 createdAt 倒序', async () => {
    const res = await listProfilesByOpenid('o-viewer', {}, 1, 10, seed());
    expect(res.list.map((p) => p._id)).toEqual(['pE', 'pB', 'pD']); // pSelf 排除、pC 未完善排除
    expect(res.hasMore).toBe(false);
    expect(res.page).toBe(1);
  });

  test('分页：pageSize+1 探测 hasMore', async () => {
    const db = seed();
    const p1 = await listProfilesByOpenid('o-viewer', {}, 1, 2, db);
    expect(p1.list).toHaveLength(2);
    expect(p1.hasMore).toBe(true);
    const p2 = await listProfilesByOpenid('o-viewer', {}, 2, 2, db);
    expect(p2.list.map((x) => x._id)).toEqual(['pD']);
    expect(p2.hasMore).toBe(false);
  });

  test('年龄区间过滤（生日字符串范围；两端可只传一端）', async () => {
    const db = seed();
    // 30 岁 pB/pD（birthday YEAR-30）在 [25,35] 内；40 岁 pE 排除
    const res = await listProfilesByOpenid('o-viewer', { ageMin: 25, ageMax: 35 }, 1, 10, db);
    expect(res.list.map((p) => p._id).sort()).toEqual(['pB', 'pD']);
    const onlyMin = await listProfilesByOpenid('o-viewer', { ageMin: 35 }, 1, 10, db);
    expect(onlyMin.list.map((p) => p._id)).toEqual(['pE']);
  });

  test('身高区间过滤（链式 gte/lte）', async () => {
    const res = await listProfilesByOpenid('o-viewer', { heightMin: 170, heightMax: 180 }, 1, 10, seed());
    expect(res.list.map((p) => p._id)).toEqual(['pD']);
  });

  test('多选过滤：学历 in + 城市 in + 婚姻状况 in + 职业 in', async () => {
    const db = seed();
    const edu = await listProfilesByOpenid('o-viewer', { educations: ['硕士'] }, 1, 10, db);
    expect(edu.list.map((p) => p._id)).toEqual(['pD']);
    const city = await listProfilesByOpenid('o-viewer', { cities: ['广东省 深圳市'] }, 1, 10, db);
    expect(city.list.map((p) => p._id).sort()).toEqual(['pB', 'pD', 'pE']); // 三条默认城市均为广东省 深圳市
    const emo = await listProfilesByOpenid('o-viewer', { emotionalStatuses: ['离异'] }, 1, 10, db);
    expect(emo.list).toHaveLength(0);
    const job = await listProfilesByOpenid('o-viewer', { jobs: ['互联网/IT', '金融'] }, 1, 10, db);
    expect(job.list.map((p) => p._id).sort()).toEqual(['pB', 'pD', 'pE']); // 默认职业均为互联网/IT
  });

  test('组合过滤取交集；VO 剔除隐私与身份字段；verified 按 users.role 标记', async () => {
    const res = await listProfilesByOpenid('o-viewer', { educations: ['本科'], ageMax: 32 }, 1, 10, seed());
    expect(res.list.map((p) => p._id)).toEqual(['pB']);
    const vo = res.list[0];
    expect(Object.keys(vo).sort()).toEqual(['_id', 'about', 'album', 'basic', 'stories', 'tags', 'verified']);
    expect(vo.verified).toBe(true); // o-b 的 role=verified
  });

  test('非法分页参数容错：page 0 → 1，pageSize 超 20 封顶，负数 → 1', async () => {
    const res = await listProfilesByOpenid('o-viewer', {}, 0, 99, seed());
    expect(res.page).toBe(1);
    expect(res.list.length).toBeLessThanOrEqual(20);
  });

  test('pageSize 封顶 20 真实生效；负数 page 容错为 1', async () => {
    const initial = { profiles: {}, users: {} };
    for (let i = 0; i < 22; i += 1) {
      const id = 'px' + i;
      initial.profiles[id] = profile(id, 'o-x' + i, '2026-08-01T00:00:0' + (i % 10) + 'Z');
    }
    const db = createMockDb(initial);
    const res = await listProfilesByOpenid('o-viewer', {}, -5, 99, db);
    expect(res.page).toBe(1);
    expect(res.list).toHaveLength(20); // 22 条 > 20 → 封顶被真正检验
    expect(res.hasMore).toBe(true);
  });

  test('列表对游客（无 users 文档）同样可用', async () => {
    const res = await listProfilesByOpenid('o-stranger', {}, 1, 10, seed());
    expect(res.list.length).toBe(4); // o-stranger 无自己的 profile，不排除任何项（共 4 个 basicInit）
  });
});
