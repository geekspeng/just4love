// tests/integration/getProfileDetail.test.js —— getProfileDetail 云函数（配额/裁剪/日志）
const { createMockDb } = require('../helpers/mock-db.js');
const {
  getProfileDetailByOpenid, toDateKey,
} = require('../../cloudfunctions/getProfileDetail/index.js');

function seed(quotas) {
  const initial = {
    users: {
      uNormal: { _id: 'uNormal', openid: 'o-normal', role: 'normal', guestNo: 'J0002' },
      uVerified: { _id: 'uVerified', openid: 'o-verified', role: 'verified', guestNo: 'J0003' },
      uAdmin: { _id: 'uAdmin', openid: 'o-admin', role: 'admin', guestNo: 'J0004' },
      uOwner: { _id: 'uOwner', openid: 'o-owner', role: 'normal', guestNo: 'J0005' },
      uTV: { _id: 'uTV', openid: 'o-target-verified', role: 'verified', guestNo: 'J0006' },
    },
    profiles: {},
    view_logs: {},
  };
  let seq = 0;
  for (const openid of ['o-owner', 'o-target-verified', 'o-t3', 'o-t4', 'o-t5', 'o-t6']) {
    const id = 'p-' + openid;
    seq += 1;
    initial.profiles[id] = {
      _id: id, openid, userId: 'u-' + seq, basicInit: true,
      basic: { guestNo: 'J000' + seq, nickname: '嘉宾' + seq, gender: '女', birthday: '1995-06-15', constellation: '双子座', avatarFileID: '', signature: '' },
      about: { emotionalStatus: '单身未婚', height: 165, education: '本科', job: '互联网/IT', city: '广东省 深圳市' },
      privacy: { asset: { house: '有房无贷', car: '有车', income: '10-20万' }, contact: { phone: '13800000000', wechat: 'wx-abc' } },
      album: [], stories: [], tags: {}, createdAt: '2026-08-0' + seq + 'T00:00:00Z',
    };
  }
  if (quotas) initial.config = { quotas: { _id: 'quotas', normal: quotas.normal, verified: quotas.verified } };
  return createMockDb(initial);
}

describe('cloudfunctions/getProfileDetail', () => {
  test('toDateKey 按东八区日界（UTC 20:30 → 次日）', () => {
    expect(toDateKey(new Date(Date.UTC(2026, 7, 19, 20, 30)))).toBe('2026-08-20');
    expect(toDateKey(new Date(Date.UTC(2026, 7, 19, 10, 30)))).toBe('2026-08-19');
  });

  test('游客（无 users 文档）→ login required，不查详情不写日志', async () => {
    const db = seed();
    const res = await getProfileDetailByOpenid('o-stranger', 'p-o-t3', db);
    expect(res).toEqual({ error: 'login required' });
    const logs = await db.collection('view_logs').where({ viewerOpenid: 'o-stranger' }).get();
    expect(logs.data).toHaveLength(0);
  });

  test('profileId 不存在 → not found', async () => {
    const res = await getProfileDetailByOpenid('o-normal', 'p-nope', seed());
    expect(res).toEqual({ error: 'not found' });
  });

  test('本人查看：self=true、隐私明文、不占配额不写日志', async () => {
    const db = seed();
    const res = await getProfileDetailByOpenid('o-owner', 'p-o-owner', db);
    expect(res.self).toBe(true);
    expect(res.quota).toBeNull();
    expect(res.profile.privacy.contact.phone).toBe('13800000000');
    const logs = await db.collection('view_logs').where({ viewerOpenid: 'o-owner' }).get();
    expect(logs.data).toHaveLength(0);
  });

  test('管理员：不限次、隐私明文、不写 view_logs', async () => {
    const db = seed();
    const res = await getProfileDetailByOpenid('o-admin', 'p-o-t3', db);
    expect(res.quota).toEqual({ used: 0, limit: -1 });
    expect(res.profile.privacy.asset.house).toBe('有房无贷');
    const logs = await db.collection('view_logs').where({ viewerOpenid: 'o-admin' }).get();
    expect(logs.data).toHaveLength(0);
  });

  test('普通用户：config 覆盖配额（normal=2），首看/复看/超额/日志写入', async () => {
    const db = seed({ normal: 2, verified: 3 });
    const first = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(first.profile._id).toBe('p-o-t3');
    expect(first.profile.privacy).toBeUndefined(); // 隐私整段剔除
    expect(first.quota).toEqual({ used: 1, limit: 2 });
    expect(first.verified).toBe(false);

    const second = await getProfileDetailByOpenid('o-normal', 'p-o-t4', db);
    expect(second.quota).toEqual({ used: 2, limit: 2 });

    // 重复看已看过的嘉宾：不重复计数、不写新日志、仍可看
    const again = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(again.profile._id).toBe('p-o-t3');
    expect(again.quota).toEqual({ used: 2, limit: 2 });

    // 第 3 个不同嘉宾 → 超额
    const third = await getProfileDetailByOpenid('o-normal', 'p-o-t5', db);
    expect(third.error).toBe('quota exceeded');
    expect(third.quota).toEqual({ used: 2, limit: 2 });

    const logs = await db.collection('view_logs').where({ viewerOpenid: 'o-normal' }).get();
    expect(logs.data).toHaveLength(2); // 只有两条真实查看
    expect(logs.data[0].targetId).toBe('p-o-t3');
    expect(logs.data[0].dateKey).toBe(toDateKey(new Date()));
  });

  test('认证用户：config 配额 verified=3，第 4 个不同嘉宾超额', async () => {
    const db = seed({ normal: 2, verified: 3 });
    for (const id of ['p-o-t3', 'p-o-t4', 'p-o-t5']) {
      const r = await getProfileDetailByOpenid('o-verified', id, db);
      expect(r.error).toBeUndefined();
    }
    const fourth = await getProfileDetailByOpenid('o-verified', 'p-o-t6', db);
    expect(fourth.error).toBe('quota exceeded');
    expect(fourth.quota).toEqual({ used: 3, limit: 3 });
  });

  test('config 缺失时用默认配额（normal=5）', async () => {
    const db = seed(); // 无 config 集合
    const ids = ['p-o-t3', 'p-o-t4', 'p-o-t5', 'p-o-t6', 'p-o-owner'];
    for (const id of ids) {
      const r = await getProfileDetailByOpenid('o-normal', id, db);
      expect(r.error).toBeUndefined();
    }
    // 5 个不同嘉宾已看满，第 6 个（复用 o-t3 的库不足——直接再看 p-o-t3 不超额因已看过，改断言 quota.used）
    const last = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(last.quota).toEqual({ used: 5, limit: 5 });
  });

  test('config 配负数配额时按默认兜底（-1 与「不限」语义冲突，拒绝采纳）', async () => {
    const db = seed({ normal: -1, verified: 15 });
    const res = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(res.error).toBeUndefined();
    expect(res.quota).toEqual({ used: 1, limit: 5 }); // -1 未被采纳，落回默认 5
  });

  test('目标嘉宾角色为 verified → CardVO.verified=true', async () => {
    const res = await getProfileDetailByOpenid('o-normal', 'p-o-target-verified', seed({ normal: 5, verified: 15 }));
    expect(res.verified).toBe(true);
    expect(res.profile.verified).toBe(true);
  });

  test('未完善资料（basicInit=false）→ not found（P2 终审遗留防御）', async () => {
    const db = seed({ normal: 5, verified: 15 });
    // 造一份未完善资料
    await db.collection('profiles').add({
      data: { _id: 'p-raw', openid: 'o-raw', basicInit: false, basic: {}, about: {}, createdAt: '2026-08-20T00:00:00Z' },
    });
    const res = await getProfileDetailByOpenid('o-normal', 'p-raw', db);
    expect(res).toEqual({ error: 'not found' });
  });

  test('超额后 quota_counters 回退到 limit（原子计数不留脏值）', async () => {
    const db = seed({ normal: 2, verified: 3 });
    await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    await getProfileDetailByOpenid('o-normal', 'p-o-t4', db);
    const third = await getProfileDetailByOpenid('o-normal', 'p-o-t5', db);
    expect(third.error).toBe('quota exceeded');
    const counter = await db.collection('quota_counters').doc('o-normal_' + toDateKey(new Date())).get();
    expect(counter.data.count).toBe(2); // 回退后 == limit
  });

  test('首次查看写「被查看」通知（快照含 guestNo），复看不重复写', async () => {
    const db = seed({ normal: 5, verified: 15 });
    await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    const notes = await db.collection('notifications').where({ toOpenid: 'o-t3' }).get();
    expect(notes.data).toHaveLength(1);
    expect(notes.data[0].type).toBe('view');
    expect(notes.data[0].payload.guestNo).toBe('J0002'); // o-normal 的 guestNo
    expect(notes.data[0].read).toBe(false);
    await getProfileDetailByOpenid('o-normal', 'p-o-t3', db); // 复看
    const again = await db.collection('notifications').where({ toOpenid: 'o-t3' }).get();
    expect(again.data).toHaveLength(1);
  });

  test('self/admin 查看不写「被查看」通知', async () => {
    const db = seed({ normal: 5, verified: 15 });
    await getProfileDetailByOpenid('o-admin', 'p-o-t3', db);
    await getProfileDetailByOpenid('o-owner', 'p-o-owner', db);
    const notes = await db.collection('notifications').where({}).get();
    expect(notes.data).toHaveLength(0);
  });

  test('consents 状态响应：self/admin 恒 approved；普通用户默认 none', async () => {
    const db = seed({ normal: 5, verified: 15 });
    const self = await getProfileDetailByOpenid('o-owner', 'p-o-owner', db);
    expect(self.consents).toEqual({ contact: 'approved', asset: 'approved' });
    const admin = await getProfileDetailByOpenid('o-admin', 'p-o-t3', db);
    expect(admin.consents).toEqual({ contact: 'approved', asset: 'approved' });
    const normal = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(normal.consents).toEqual({ contact: 'none', asset: 'none' });
    expect(normal.profile.privacy).toBeUndefined();
  });

  test('approved 字段解锁对应隐私子段；rejected/revoked/pending 不解锁', async () => {
    const db = seed({ normal: 5, verified: 15 });
    const consents = db.collection('consents');
    await consents.add({ data: { requesterOpenid: 'o-normal', ownerOpenid: 'o-t3', field: 'contact', status: 'approved', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', decidedAt: '2026-08-01T00:00:00Z' } });
    await consents.add({ data: { requesterOpenid: 'o-normal', ownerOpenid: 'o-t3', field: 'asset', status: 'revoked', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z', decidedAt: '2026-08-02T00:00:00Z' } });
    const res = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(res.consents).toEqual({ contact: 'approved', asset: 'revoked' });
    expect(res.profile.privacy).toEqual({ contact: { phone: '13800000000', wechat: 'wx-abc' } }); // 仅解锁子段
    // 复看路径同样生效
    const again = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(again.profile.privacy.contact.phone).toBe('13800000000');
  });

  test('强制资料隐藏（forceHidden）：直链/分享一律 not found，管理员与本人同样不可见（P4 举报处置）', async () => {
    const db = seed();
    await db.collection('profiles').doc('p-o-t3').update({ data: { forceHidden: true } });
    expect(await getProfileDetailByOpenid('o-normal', 'p-o-t3', db)).toEqual({ error: 'not found' });
    expect(await getProfileDetailByOpenid('o-admin', 'p-o-t3', db)).toEqual({ error: 'not found' });
    // 不占配额不写日志
    const logs = await db.collection('view_logs').where({ viewerOpenid: 'o-normal' }).get();
    expect(logs.data).toHaveLength(0);
    const counters = await db.collection('quota_counters').where({}).get();
    expect(counters.data).toHaveLength(0);
  });
});
