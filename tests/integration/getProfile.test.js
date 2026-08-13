// getProfile 云函数集成测试
// 直接 require 云函数源码并调用 main，验证入参/出参契约。
// 当前 queryProfile 使用 mock 数据，无需真实云数据库。
const cloudFn = require('../../cloudfunctions/getProfile/index.js');

describe('cloudfunctions/getProfile', () => {
  test('传入有效 userId 返回 profile', async () => {
    const res = await cloudFn.main({ userId: 'u_demo_1' });
    expect(res.error).toBeUndefined();
    expect(res.profile).toBeDefined();
    expect(res.profile.nickname).toBe('小鱼');
    expect(res.profile.height).toBe(165);
  });

  test('传入不存在的 userId 返回 not found 错误', async () => {
    const res = await cloudFn.main({ userId: 'u_not_exist' });
    expect(res.profile).toBeUndefined();
    expect(res.error).toBe('profile not found');
  });

  test('缺少 userId 返回 required 错误', async () => {
    const res = await cloudFn.main({});
    expect(res.error).toBe('userId required');
  });

  test('event 为空时返回 required 错误', async () => {
    const res = await cloudFn.main();
    expect(res.error).toBe('userId required');
  });

  test('mock 库覆盖全部示例用户', async () => {
    for (const id of Object.keys(cloudFn.MOCK_DB)) {
      const res = await cloudFn.main({ userId: id });
      expect(res.profile).toEqual(cloudFn.MOCK_DB[id]);
    }
  });
});
