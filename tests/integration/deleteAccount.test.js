// tests/integration/deleteAccount.test.js
const { createMockDb } = require('../helpers/mock-db.js');
const { deleteAccountByOpenid } = require('../../cloudfunctions/deleteAccount/index.js');

describe('cloudfunctions/deleteAccount', () => {
  test('删除 users 与 profiles 文档', async () => {
    const db = createMockDb({
      users: { u1: { _id: 'u1', openid: 'openid-a', role: 'normal', guestNo: 'J0001' } },
      profiles: { p1: { _id: 'p1', openid: 'openid-a', userId: 'u1' } },
    });
    const res = await deleteAccountByOpenid('openid-a', db);
    expect(res.deleted).toBe(true);
    expect((await db.collection('users').where({ openid: 'openid-a' }).get()).data).toHaveLength(0);
    expect((await db.collection('profiles').where({ openid: 'openid-a' }).get()).data).toHaveLength(0);
  });

  test('用户本就不存在时返回 deleted:false（幂等）', async () => {
    const res = await deleteAccountByOpenid('openid-none', createMockDb());
    expect(res.deleted).toBe(false);
  });
});
