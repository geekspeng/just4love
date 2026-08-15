// tests/integration/getMyProfile.test.js
const { createMockDb } = require('../helpers/mock-db.js');
const { getMyProfileByOpenid } = require('../../cloudfunctions/getMyProfile/index.js');
const { loginWithOpenid } = require('../../cloudfunctions/login/index.js');

describe('cloudfunctions/getMyProfile', () => {
  test('用户不存在（未先 login）返回错误', async () => {
    const db = createMockDb();
    const res = await getMyProfileByOpenid('openid-none', db);
    expect(res.error).toBe('user not found');
  });

  test('有用户但尚未填资料：profile 为 null，user 完整', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const res = await getMyProfileByOpenid('openid-a', db);
    expect(res.error).toBeUndefined();
    expect(res.profile).toBeNull();
    expect(res.user.guestNo).toBe('J0001');
    expect(res.user.role).toBe('normal');
  });

  test('已有资料文档时原样返回', async () => {
    const db = createMockDb({
      users: { u1: { _id: 'u1', openid: 'openid-a', phone: '', role: 'normal', guestNo: 'J0001' } },
      profiles: {
        p1: { _id: 'p1', openid: 'openid-a', userId: 'u1', basicInit: true, basic: { nickname: '小鱼' } },
      },
    });
    const res = await getMyProfileByOpenid('openid-a', db);
    expect(res.profile._id).toBe('p1');
    expect(res.profile.basic.nickname).toBe('小鱼');
    expect(res.user.userId).toBe('u1');
  });
});
