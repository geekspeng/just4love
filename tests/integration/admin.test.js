// tests/integration/admin.test.js —— 管理后台聚合云函数（action 路由，role=admin 守卫）
const { createMockDb } = require('../helpers/mock-db.js');
const { adminByOpenid } = require('../../cloudfunctions/admin/index.js');

function seed() {
  return createMockDb({
    users: {
      uAdmin: { _id: 'uAdmin', openid: 'o-admin', role: 'admin', guestNo: 'J0000' },
      uA: { _id: 'uA', openid: 'o-a', role: 'normal', guestNo: 'J0001' },
      uB: { _id: 'uB', openid: 'o-b', role: 'normal', guestNo: 'J0002' },
    },
    profiles: {
      pA: { _id: 'pA', openid: 'o-a', basicInit: true, basic: { guestNo: 'J0001', nickname: '小甲' }, about: {}, createdAt: '2026-08-01T00:00:00Z' },
      pB: { _id: 'pB', openid: 'o-b', basicInit: true, basic: { guestNo: 'J0002', nickname: '小乙' }, about: {}, createdAt: '2026-08-02T00:00:00Z' },
    },
    verifications: {
      v1: { _id: 'v1', userId: 'uA', openid: 'o-a', type: 'identity', materialFileIDs: ['cloud://id1'], status: 'pending', reviewedBy: null, reviewedAt: null, createdAt: '2026-08-20T01:00:00Z', updatedAt: '2026-08-20T01:00:00Z' },
      v2: { _id: 'v2', userId: 'uB', openid: 'o-b', type: 'career', materialFileIDs: ['cloud://c1'], status: 'approved', reviewedBy: 'o-admin', reviewedAt: '2026-08-19T00:00:00Z', createdAt: '2026-08-18T00:00:00Z', updatedAt: '2026-08-19T00:00:00Z' },
    },
    reports: {
      r1: { _id: 'r1', reporterOpenid: 'o-a', targetId: 'pB', targetOpenid: 'o-b', type: '诈骗行为', description: 'x', screenshotFileIDs: [], status: 'pending', createdAt: '2026-08-20T02:00:00Z' },
    },
    config: {
      quotas: { _id: 'quotas', normal: 5, verified: 15 },
    },
  });
}

describe('cloudfunctions/admin（守卫与路由）', () => {
  test('游客 → login required；normal 用户任意 action → forbidden；未知 action → invalid action', async () => {
    const db = seed();
    expect(await adminByOpenid('o-x', { action: 'getConfig' }, db)).toEqual({ error: 'login required' });
    expect(await adminByOpenid('o-a', { action: 'getConfig' }, db)).toEqual({ error: 'forbidden' });
    expect(await adminByOpenid('o-admin', { action: 'wave' }, db)).toEqual({ error: 'invalid action' });
  });
});

describe('cloudfunctions/admin reviewVerification', () => {
  test('approve：pending→approved + role 升级 normal→verified + verifiedTypes 追加 + 审核人落档', async () => {
    const db = seed();
    const res = await adminByOpenid('o-admin', { action: 'reviewVerification', verificationId: 'v1', decision: 'approve' }, db);
    expect(res).toEqual({ status: 'approved' });
    const v = (await db.collection('verifications').doc('v1').get()).data;
    expect(v.status).toBe('approved');
    expect(v.reviewedBy).toBe('o-admin');
    expect(v.reviewedAt).toBeTruthy();
    const uA = (await db.collection('users').doc('uA').get()).data;
    expect(uA.role).toBe('verified');
    expect(uA.verifiedTypes).toEqual(['identity']);
  });

  test('approve 对已认证用户：role 不动，verifiedTypes 去重追加；reject 落 rejected', async () => {
    const db = seed();
    // uB 已因 career approved 升级（造档），再 approve identity → verifiedTypes 两项
    await db.collection('users').doc('uB').update({ data: { role: 'verified', verifiedTypes: ['career'] } });
    await db.collection('verifications').add({
      data: { _id: 'v3', userId: 'uB', openid: 'o-b', type: 'identity', materialFileIDs: ['cloud://i1'], status: 'pending', reviewedBy: null, reviewedAt: null, createdAt: '2026-08-21T00:00:00Z', updatedAt: '2026-08-21T00:00:00Z' },
    });
    const res = await adminByOpenid('o-admin', { action: 'reviewVerification', verificationId: 'v3', decision: 'approve' }, db);
    expect(res).toEqual({ status: 'approved' });
    const uB = (await db.collection('users').doc('uB').get()).data;
    expect(uB.role).toBe('verified'); // 已是 verified 不重复升级（也不降级）
    expect(uB.verifiedTypes).toEqual(['career', 'identity']);
    // reject：新造一条 pending
    await db.collection('verifications').add({
      data: { _id: 'v4', userId: 'uB', openid: 'o-b', type: 'education', materialFileIDs: ['cloud://e1'], status: 'pending', reviewedBy: null, reviewedAt: null, createdAt: '2026-08-21T01:00:00Z', updatedAt: '2026-08-21T01:00:00Z' },
    });
    const rej = await adminByOpenid('o-admin', { action: 'reviewVerification', verificationId: 'v4', decision: 'reject' }, db);
    expect(rej).toEqual({ status: 'rejected' });
    const uB2 = (await db.collection('users').doc('uB').get()).data;
    expect(uB2.role).toBe('verified'); // reject 不动角色
  });

  test('非法 decision / 不存在 / 非 pending → 对应 error', async () => {
    const db = seed();
    expect(await adminByOpenid('o-admin', { action: 'reviewVerification', verificationId: 'v1', decision: 'wave' }, db))
      .toEqual({ error: 'invalid decision' });
    expect(await adminByOpenid('o-admin', { action: 'reviewVerification', verificationId: 'v-nope', decision: 'approve' }, db))
      .toEqual({ error: 'not found' });
    expect(await adminByOpenid('o-admin', { action: 'reviewVerification', verificationId: 'v2', decision: 'approve' }, db))
      .toEqual({ error: 'invalid state' }); // v2 已 approved
  });
});

describe('cloudfunctions/admin listVerifications / listGuests / listReports', () => {
  test('listVerifications：默认全部倒序 + join 嘉宾编号/昵称；按 status 过滤', async () => {
    const db = seed();
    const all = await adminByOpenid('o-admin', { action: 'listVerifications' }, db);
    expect(all.list.map((v) => v._id)).toEqual(['v1', 'v2']); // createdAt 倒序
    expect(all.list[0]).toMatchObject({ type: 'identity', status: 'pending', guestNo: 'J0001', nickname: '小甲' });
    const pendingOnly = await adminByOpenid('o-admin', { action: 'listVerifications', status: 'pending' }, db);
    expect(pendingOnly.list.map((v) => v._id)).toEqual(['v1']);
  });

  test('listGuests：keyword 按编号/昵称包含过滤；缺省 listed/forceHidden 语义为 true/false', async () => {
    const db = seed();
    const byNo = await adminByOpenid('o-admin', { action: 'listGuests', keyword: 'J0002' }, db);
    expect(byNo.list.map((g) => g.profileId)).toEqual(['pB']);
    const byName = await adminByOpenid('o-admin', { action: 'listGuests', keyword: '小甲' }, db);
    expect(byName.list.map((g) => g.profileId)).toEqual(['pA']);
    expect(byName.list[0]).toMatchObject({ guestNo: 'J0001', nickname: '小甲', listed: true, forceHidden: false, role: 'normal' });
    const all = await adminByOpenid('o-admin', { action: 'listGuests' }, db);
    expect(all.list).toHaveLength(2);
  });

  test('listReports：join 被举报人昵称/编号；按 status 过滤', async () => {
    const db = seed();
    const res = await adminByOpenid('o-admin', { action: 'listReports' }, db);
    expect(res.list).toHaveLength(1);
    expect(res.list[0]).toMatchObject({
      _id: 'r1', type: '诈骗行为', status: 'pending', targetNickname: '小乙', targetGuestNo: 'J0002',
    });
    const done = await adminByOpenid('o-admin', { action: 'listReports', status: 'resolved' }, db);
    expect(done.list).toHaveLength(0);
  });
});

describe('cloudfunctions/admin setProfileFlags / handleReport', () => {
  test('setProfileFlags：下架与强制隐藏写入并返回新值；不存在 → not found', async () => {
    const db = seed();
    const res = await adminByOpenid('o-admin', { action: 'setProfileFlags', profileId: 'pA', listed: false }, db);
    expect(res).toEqual({ profileId: 'pA', listed: false, forceHidden: false });
    const pA = (await db.collection('profiles').doc('pA').get()).data;
    expect(pA.listed).toBe(false);
    const hide = await adminByOpenid('o-admin', { action: 'setProfileFlags', profileId: 'pB', forceHidden: true }, db);
    expect(hide).toEqual({ profileId: 'pB', listed: true, forceHidden: true });
    expect(await adminByOpenid('o-admin', { action: 'setProfileFlags', profileId: 'p-nope', listed: false }, db))
      .toEqual({ error: 'not found' });
  });

  test('handleReport hide：report→resolved 且被举报人 forceHidden；ignore→ignored；非 pending→invalid state', async () => {
    const db = seed();
    const hide = await adminByOpenid('o-admin', { action: 'handleReport', reportId: 'r1', handle: 'hide' }, db);
    expect(hide).toEqual({ status: 'resolved' });
    const r1 = (await db.collection('reports').doc('r1').get()).data;
    expect(r1.status).toBe('resolved');
    const pB = (await db.collection('profiles').doc('pB').get()).data;
    expect(pB.forceHidden).toBe(true);
    expect(await adminByOpenid('o-admin', { action: 'handleReport', reportId: 'r1', handle: 'ignore' }, db))
      .toEqual({ error: 'invalid state' }); // 已处理
    // 新举报 ignore
    await db.collection('reports').add({
      data: { _id: 'r2', reporterOpenid: 'o-b', targetId: 'pA', targetOpenid: 'o-a', type: '骚扰', description: 'y', screenshotFileIDs: [], status: 'pending', createdAt: '2026-08-21T00:00:00Z' },
    });
    const ignore = await adminByOpenid('o-admin', { action: 'handleReport', reportId: 'r2', handle: 'ignore' }, db);
    expect(ignore).toEqual({ status: 'ignored' });
    expect(await adminByOpenid('o-admin', { action: 'handleReport', reportId: 'r2', handle: 'wave' }, db))
      .toEqual({ error: 'invalid handle' });
  });
});

describe('cloudfunctions/admin getConfig / saveQuotas / saveGroupQr', () => {
  test('getConfig：默认 quotas 与 groupQr（未配置为 null）', async () => {
    const db = seed();
    const res = await adminByOpenid('o-admin', { action: 'getConfig' }, db);
    expect(res.quotas).toEqual({ normal: 5, verified: 15 });
    expect(res.groupQrFileID).toBe(null);
  });

  test('saveQuotas：校验非负数字并落 config/quotas；saveGroupQr 落 config/groupQr 且 getConfig 往返', async () => {
    const db = seed();
    expect(await adminByOpenid('o-admin', { action: 'saveQuotas', normal: -1, verified: 15 }, db))
      .toEqual({ error: 'invalid quotas' });
    expect(await adminByOpenid('o-admin', { action: 'saveQuotas', normal: 8, verified: 20 }, db))
      .toEqual({ ok: true });
    expect(await adminByOpenid('o-admin', { action: 'saveGroupQr', fileID: 'cloud://qr.png' }, db))
      .toEqual({ ok: true });
    const cfg = await adminByOpenid('o-admin', { action: 'getConfig' }, db);
    expect(cfg.quotas).toEqual({ normal: 8, verified: 20 });
    expect(cfg.groupQrFileID).toBe('cloud://qr.png');
    expect(await adminByOpenid('o-admin', { action: 'saveGroupQr', fileID: '' }, db))
      .toEqual({ error: 'invalid fileID' });
  });
});
