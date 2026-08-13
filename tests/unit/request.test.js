const { callFunction } = require('../../miniprogram/utils/request.js');

beforeEach(() => {
  // 每个用例前重置 wx.cloud.callFunction 的 mock
  global.wx.cloud.callFunction.mockReset();
});

describe('utils/request', () => {
  test('成功时返回 result', async () => {
    global.wx.cloud.callFunction.mockResolvedValue({
      result: { profile: { id: 'u1' } },
    });
    const res = await callFunction('getProfile', { userId: 'u1' });
    expect(res).toEqual({ profile: { id: 'u1' } });
    expect(global.wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'getProfile',
      data: { userId: 'u1' },
    });
  });

  test('result 缺失时返回 null', async () => {
    global.wx.cloud.callFunction.mockResolvedValue({ result: null });
    const res = await callFunction('getProfile', {});
    expect(res).toBeNull();
  });

  test('callFunction 抛错时返回 null（不 reject）', async () => {
    global.wx.cloud.callFunction.mockRejectedValue(new Error('network'));
    const res = await callFunction('getProfile', {});
    expect(res).toBeNull();
  });

  test('wx.cloud 不存在时返回 null', async () => {
    const original = global.wx.cloud;
    delete global.wx.cloud;
    const res = await callFunction('getProfile', {});
    expect(res).toBeNull();
    global.wx.cloud = original;
  });
});
