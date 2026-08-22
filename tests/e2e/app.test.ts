/**
 * E2E 冒烟测试 —— 启动 / 三个 tab 切换 / 核心元素渲染
 *
 * 新功能 E2E 测试请参考本文件的结构，或使用项目 skill：e2e-test。
 */
import {
  connectOrLaunch,
  closeSession,
  currentRoute,
  pageData,
  countSelector,
  runInApp,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
} from './helpers';

describe('just4love E2E', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await connectOrLaunch();
    mp = session.miniProgram;
  }, 120000);

  afterAll(() => closeSession(session));

  it('启动后默认落在「遇见」页', async () => {
    expect(await currentRoute(mp)).toContain('recommend');
  }, T);

  it('「遇见」页列表为真实数据（CardVO 脱敏：无 privacy/openid 字段）', async () => {
    expect(await countSelector(mp, '.recommend')).toBe(1);
    const list = await pageData<any[]>(mp, 'list');
    expect(Array.isArray(list)).toBe(true); // 云调用在途时为初始 []，结构性断言不赌数据量
    for (const item of list) {
      expect(item.privacy).toBeUndefined();
      expect(item.openid).toBeUndefined();
      expect(item._id).toBeTruthy();
    }
  }, T);

  it('切换到「消息」tab 并校验通知流数据（P3 改版）', async () => {
    await mp.switchTab('/pages/message/message');
    expect(await currentRoute(mp)).toContain('message');

    // 通知流数据键：云调用在途时为初始 []/0，结构性断言不赌数据量
    const entries = await pageData<unknown[]>(mp, 'entries');
    expect(Array.isArray(entries)).toBe(true);
    const unread = await pageData<number>(mp, 'unread');
    expect(typeof unread).toBe('number');
  }, T);

  it('切换到「我的」tab 并校验资料卡片与菜单', async () => {
    await mp.switchTab('/pages/mine/mine');
    expect(await currentRoute(mp)).toContain('mine');

    // P1 六项 + P4 新增「我的认证/加入交友群」两项（normal 角色共八项；管理后台仅 admin 出现）；
    // 无云环境时登录态兜底为 null（页面显示「点击登录」）
    expect(await countSelector(mp, '.mine__menu')).toBe(8);
    const user = await pageData<{ guestNo: string } | null>(mp, 'user');
    expect(user === null || typeof user.guestNo === 'string').toBe(true);
  }, T);

  it('「我的」页菜单交互可触发（onTapMenu）', async () => {
    // 先 stub wx.navigateTo 再驱动 onTapMenu：真导航走 wx.navigateTo，而该 API
    // 在本机 DevTools 上挂死（success/fail 均不回调，10s 后 automator 报
    // Uncaught [object Object]，会砸进后续用例——见 helpers navTo 注释）。
    // 改为验证分发目标 URL，不真跳页。
    const routed = await runInApp<{ url: string } | null>(mp, () => {
      const page = getCurrentPages().slice(-1)[0];
      const orig = wx.navigateTo;
      let captured: { url: string } | null = null;
      wx.navigateTo = (opt: NavOption) => {
        captured = { url: opt.url || '' };
      };
      try {
        page.onTapMenu({ currentTarget: { dataset: { id: 'edit' } } });
      } finally {
        wx.navigateTo = orig;
      }
      return captured;
    });
    expect(routed).toEqual({ url: '/pages/profile-edit/profile-edit' });
  }, T);

  it('切回「遇见」tab', async () => {
    await mp.switchTab('/pages/recommend/recommend');
    expect(await currentRoute(mp)).toContain('recommend');
  }, T);
});
