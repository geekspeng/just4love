// tests/unit/auth.test.js —— 登录态管理
const auth = require('../../miniprogram/utils/auth.js');

const USER = { userId: 'u1', openid: 'ox', phone: '', role: 'normal', guestNo: 'J0001' };

function freshStorage() {
  wx.getStorageSync.mockReturnValue('');
  wx.setStorageSync.mockClear();
  wx.removeStorageSync.mockClear();
}
function loginResult(user) {
  wx.cloud.callFunction.mockResolvedValueOnce(
    user ? { result: { user, isNew: true } } : { result: null }
  );
}

beforeEach(() => {
  jest.resetModules(); // 每个用例重载 auth，清掉模块内 refreshing 去重状态
  freshStorage();
  global.__appStub = { globalData: {} };
  wx.cloud.callFunction.mockReset();
});

describe('utils/auth', () => {
  test('无缓存时 ensureLogin 调 login 云函数并写缓存与 globalData', async () => {
    loginResult(USER);
    const user = await require('../../miniprogram/utils/auth.js').ensureLogin();
    expect(user).toEqual(USER);
    expect(wx.cloud.callFunction).toHaveBeenCalledWith({ name: 'login', data: {} });
    expect(wx.setStorageSync).toHaveBeenCalledWith('j4l_user', USER);
    expect(global.getApp().globalData.user).toEqual(USER);
  });

  test('有缓存时 ensureLogin 立即返回缓存（不再发 login）', async () => {
    wx.getStorageSync.mockReturnValue(USER);
    const user = await require('../../miniprogram/utils/auth.js').ensureLogin();
    expect(user).toEqual(USER);
    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
  });

  test('login 失败（result null）返回 null 且不写缓存', async () => {
    loginResult(null);
    const user = await require('../../miniprogram/utils/auth.js').ensureLogin();
    expect(user).toBeNull();
    expect(wx.setStorageSync).not.toHaveBeenCalled();
  });

  test('clearLogin 清缓存与 globalData', () => {
    wx.getStorageSync.mockReturnValue(USER);
    global.getApp().globalData.user = USER;
    require('../../miniprogram/utils/auth.js').clearLogin();
    expect(wx.removeStorageSync).toHaveBeenCalledWith('j4l_user');
    expect(global.getApp().globalData.user).toBeNull();
  });

  test('bindPhoneWithCode 成功后回写缓存中的 phone', async () => {
    wx.getStorageSync.mockReturnValue(USER);
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { phone: '13800000000' } });
    const res = await require('../../miniprogram/utils/auth.js').bindPhoneWithCode('code1');
    expect(wx.cloud.callFunction).toHaveBeenCalledWith({ name: 'bindPhone', data: { code: 'code1' } });
    expect(res.phone).toBe('13800000000');
    const saved = wx.setStorageSync.mock.calls[0][1];
    expect(saved.phone).toBe('13800000000');
  });

  test('并发两次无缓存 ensureLogin 只发一次 login', async () => {
    loginResult(USER);
    const mod = require('../../miniprogram/utils/auth.js');
    const [a, b] = await Promise.all([mod.ensureLogin(), mod.ensureLogin()]);
    expect(a).toEqual(USER);
    expect(b).toEqual(USER);
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1);
  });
});
