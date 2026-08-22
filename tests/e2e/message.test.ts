/**
 * 消息页 E2E 测试 —— P3 改版后为系统通知流（entries/unread/loading），
 * 断言数据结构与顶部入口交互；不再有 P2 前的 mock 会话（sessions/小鱼）。
 */
import {
  getSharedSession,
  currentRoute,
  pageData,
  runInApp,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
} from './helpers';

describe('消息页 E2E', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await getSharedSession();
    mp = session.miniProgram;
  }, 120000);

  it('进入消息页', async () => {
    await mp.switchTab('/pages/message/message');
    expect(await currentRoute(mp)).toContain('message');
  }, T);

  it('通知流数据结构符合预期（entries/unread）', async () => {
    // 真实云函数链路，条目数取决于账号通知，做结构性断言不赌数据量
    const entries = await pageData<unknown[]>(mp, 'entries');
    expect(Array.isArray(entries)).toBe(true);
    const unread = await pageData<number>(mp, 'unread');
    expect(typeof unread).toBe('number');
  }, T);

  it('顶部入口可触发（onOpenInteractions 分发 interaction-list）', async () => {
    // stub wx.navigateTo 捕获分发 URL（真导航的 navigateTo 在本机挂死，见 helpers navTo 注释）
    const routed = await runInApp<{ url: string } | null>(mp, () => {
      const page = getCurrentPages().slice(-1)[0];
      const orig = wx.navigateTo;
      let captured: { url: string } | null = null;
      wx.navigateTo = (opt: NavOption) => {
        captured = { url: opt.url || '' };
      };
      try {
        page.onOpenInteractions({ currentTarget: { dataset: { type: 'like' } } });
      } finally {
        wx.navigateTo = orig;
      }
      return captured;
    });
    expect(routed).toEqual({ url: '/pages/interaction-list/interaction-list?type=like' });
  }, T);
});
