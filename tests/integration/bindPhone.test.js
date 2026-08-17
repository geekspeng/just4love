// tests/integration/bindPhone.test.js
const { createMockDb } = require('../helpers/mock-db.js');
const { bindPhoneByOpenid } = require('../../cloudfunctions/bindPhone/index.js');
const { loginWithOpenid } = require('../../cloudfunctions/login/index.js');

const okOpenapi = {
  phonenumber: { getPhoneNumber: async () => ({ phoneInfo: { phoneNumber: '13800000000' } }) },
};

describe('cloudfunctions/bindPhone', () => {
  test('用户不存在返回错误', async () => {
    const res = await bindPhoneByOpenid('openid-x', 'code', createMockDb(), okOpenapi);
    expect(res.error).toBe('user not found');
  });

  test('code 有效：写入 users.phone 并返回手机号', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const res = await bindPhoneByOpenid('openid-a', 'good-code', db, okOpenapi);
    expect(res.phone).toBe('13800000000');
    const users = await db.collection('users').where({ openid: 'openid-a' }).get();
    expect(users.data[0].phone).toBe('13800000000');
  });

  test('code 无效（openapi 抛错或无号码）返回错误', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const badOpenapi = { phonenumber: { getPhoneNumber: async () => { throw new Error('bad code'); } } };
    expect((await bindPhoneByOpenid('openid-a', 'bad', db, badOpenapi)).error).toBe('phone code invalid');
    const emptyOpenapi = { phonenumber: { getPhoneNumber: async () => ({}) } };
    expect((await bindPhoneByOpenid('openid-a', 'bad', db, emptyOpenapi)).error).toBe('phone code invalid');
  });

  test('openapi 调用异常时记录错误日志（暴露 config.json 权限缺失等真实原因）', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const scopeErrOpenapi = {
      phonenumber: {
        getPhoneNumber: async () => { throw new Error('api scope is not declared in config.json'); },
      },
    };
    const res = await bindPhoneByOpenid('openid-a', 'any', db, scopeErrOpenapi);
    expect(res.error).toBe('phone code invalid');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
