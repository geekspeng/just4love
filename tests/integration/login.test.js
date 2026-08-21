// tests/integration/login.test.js —— login 云函数（注入 mock 数据库）
const { createMockDb } = require('../helpers/mock-db.js');
const { loginWithOpenid, nextGuestNo } = require('../../cloudfunctions/login/index.js');

describe('cloudfunctions/login', () => {
  test('首次登录：自动建档，嘉宾编号 J0001，角色 normal', async () => {
    const db = createMockDb();
    const res = await loginWithOpenid('openid-a', db);
    expect(res.isNew).toBe(true);
    expect(res.user.guestNo).toBe('J0001');
    expect(res.user.role).toBe('normal');
    expect(res.user.phone).toBe('');
    expect(res.user.userId).toBeTruthy();
    const users = await db.collection('users').where({ openid: 'openid-a' }).get();
    expect(users.data).toHaveLength(1);
  });

  test('同一 openid 再次登录：不新建档，返回同一用户', async () => {
    const db = createMockDb();
    const first = await loginWithOpenid('openid-a', db);
    const second = await loginWithOpenid('openid-a', db);
    expect(second.isNew).toBe(false);
    expect(second.user.userId).toBe(first.user.userId);
    expect(second.user.guestNo).toBe('J0001');
  });

  test('第二个新用户递增为 J0002', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const res = await loginWithOpenid('openid-b', db);
    expect(res.user.guestNo).toBe('J0002');
  });

  test('计数器超过 9999 时自然增长为 J10000', async () => {
    const db = createMockDb({ counters: { guestNo: { _id: 'guestNo', seq: 9999 } } });
    expect(await nextGuestNo(db)).toBe('J10000');
  });

  test('user VO 字段精确（不泄漏内部字段）', async () => {
    const db = createMockDb();
    const { user } = await loginWithOpenid('openid-a', db);
    expect(Object.keys(user).sort()).toEqual(['guestNo', 'openid', 'phone', 'role', 'userId', 'verifiedTypes']);
    expect(user.verifiedTypes).toEqual([]); // 未认证为空数组
  });

  test('认证升级后的用户登录：verifiedTypes 直出', async () => {
    const db = createMockDb({
      users: { u1: { _id: 'u1', openid: 'openid-a', phone: '', role: 'verified', guestNo: 'J0001', verifiedTypes: ['identity'] } },
    });
    const { user, isNew } = await loginWithOpenid('openid-a', db);
    expect(isNew).toBe(false);
    expect(user.role).toBe('verified');
    expect(user.verifiedTypes).toEqual(['identity']);
  });
});
