// tests/integration/consents.test.js —— 授权流：requestConsent / respondConsent
const { createMockDb } = require('../helpers/mock-db.js');
const { requestConsentByOpenid } = require('../../cloudfunctions/requestConsent/index.js');
const { respondConsentByOpenid: respond } = require('../../cloudfunctions/respondConsent/index.js');

function seed() {
  return createMockDb({
    users: {
      uA: { _id: 'uA', openid: 'o-a', role: 'normal', guestNo: 'J0001' },
      uB: { _id: 'uB', openid: 'o-b', role: 'normal', guestNo: 'J0002' },
    },
    profiles: {
      pB: { _id: 'pB', openid: 'o-b', basicInit: true, basic: { guestNo: 'J0002', nickname: '小乙' }, about: {}, createdAt: '2026-08-01T00:00:00Z' },
    },
    consents: {},
    notifications: {},
  });
}

describe('cloudfunctions/requestConsent', () => {
  test('游客/非法 field/目标不存在/自己 → 对应 error', async () => {
    const db = seed();
    expect(await requestConsentByOpenid('o-x', 'pB', 'contact', db)).toEqual({ error: 'login required' });
    expect(await requestConsentByOpenid('o-a', 'pB', 'salary', db)).toEqual({ error: 'invalid field' });
    expect(await requestConsentByOpenid('o-a', 'p-nope', 'contact', db)).toEqual({ error: 'not found' });
    await db.collection('profiles').add({ data: { _id: 'pA', openid: 'o-a', basicInit: true, basic: {}, about: {}, createdAt: '2026-08-01T00:00:00Z' } });
    expect(await requestConsentByOpenid('o-a', 'pA', 'contact', db)).toEqual({ error: 'cannot request self' });
  });

  test('首次申请：pending + owner 收 consent_request 通知（含 consentId/field/快照）', async () => {
    const db = seed();
    const res = await requestConsentByOpenid('o-a', 'pB', 'contact', db);
    expect(res).toEqual({ status: 'pending' });
    const docs = await db.collection('consents').where({ requesterOpenid: 'o-a', ownerOpenid: 'o-b' }).get();
    expect(docs.data).toHaveLength(1);
    expect(docs.data[0].field).toBe('contact');
    const notes = await db.collection('notifications').where({ toOpenid: 'o-b' }).get();
    expect(notes.data).toHaveLength(1);
    expect(notes.data[0].type).toBe('consent_request');
    expect(notes.data[0].payload.field).toBe('contact');
    expect(notes.data[0].payload.consentId).toBe(docs.data[0]._id);
    expect(notes.data[0].payload.guestNo).toBe('J0001');
  });

  test('pending/approved 幂等（不重复通知）；rejected/revoked 可重新申请', async () => {
    const db = seed();
    await requestConsentByOpenid('o-a', 'pB', 'contact', db);
    const again = await requestConsentByOpenid('o-a', 'pB', 'contact', db);
    expect(again).toEqual({ status: 'pending', unchanged: true });
    const notes1 = await db.collection('notifications').where({ toOpenid: 'o-b' }).get();
    expect(notes1.data).toHaveLength(1);
    const doc = (await db.collection('consents').where({ requesterOpenid: 'o-a' }).get()).data[0];
    await respond(db, 'o-b', doc._id, 'approve');
    const approved = await requestConsentByOpenid('o-a', 'pB', 'contact', db);
    expect(approved).toEqual({ status: 'approved', unchanged: true });
    await respond(db, 'o-b', doc._id, 'revoke');
    const reapplied = await requestConsentByOpenid('o-a', 'pB', 'contact', db);
    expect(reapplied).toEqual({ status: 'pending' }); // revoked → 重新申请
    const docs = await db.collection('consents').where({ requesterOpenid: 'o-a' }).get();
    expect(docs.data).toHaveLength(1); // 复用同文档
  });
});

describe('cloudfunctions/respondConsent', () => {
  async function pendingConsent(db) {
    await requestConsentByOpenid('o-a', 'pB', 'asset', db);
    return (await db.collection('consents').where({ requesterOpenid: 'o-a' }).get()).data[0];
  }

  test('非 owner → forbidden；游客 → login required；非法 action/不存在 → 对应 error', async () => {
    const db = seed();
    const doc = await pendingConsent(db);
    expect(await respond(db, 'o-x', doc._id, 'approve')).toEqual({ error: 'login required' });
    expect(await respond(db, 'o-a', doc._id, 'approve')).toEqual({ error: 'forbidden' });
    expect(await respond(db, 'o-b', doc._id, 'wave')).toEqual({ error: 'invalid action' });
    expect(await respond(db, 'o-b', 'c-nope', 'approve')).toEqual({ error: 'not found' });
  });

  test('approve：pending→approved + requester 收 consent_result(approved)', async () => {
    const db = seed();
    const doc = await pendingConsent(db);
    const res = await respond(db, 'o-b', doc._id, 'approve');
    expect(res).toEqual({ status: 'approved' });
    const after = (await db.collection('consents').doc(doc._id).get()).data;
    expect(after.status).toBe('approved');
    expect(after.decidedAt).toBeTruthy();
    const notes = await db.collection('notifications').where({ toOpenid: 'o-a' }).get();
    expect(notes.data).toHaveLength(1);
    expect(notes.data[0].type).toBe('consent_result');
    expect(notes.data[0].payload).toMatchObject({ field: 'asset', status: 'approved' });
  });

  test('状态机：reject 仅 pending；revoke 仅 approved；违例 → invalid state', async () => {
    const db = seed();
    const doc = await pendingConsent(db);
    expect(await respond(db, 'o-b', doc._id, 'revoke')).toEqual({ error: 'invalid state' });
    await respond(db, 'o-b', doc._id, 'approve');
    expect(await respond(db, 'o-b', doc._id, 'approve')).toEqual({ error: 'invalid state' });
    expect(await respond(db, 'o-b', doc._id, 'reject')).toEqual({ error: 'invalid state' });
    const revoked = await respond(db, 'o-b', doc._id, 'revoke'); // 撤销：字段重新隐藏
    expect(revoked).toEqual({ status: 'revoked' });
  });
});
