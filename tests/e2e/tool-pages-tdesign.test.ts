import {
  getSharedSession,
  currentRoute,
  countSelector,
  navTo,
  pageData,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
} from './helpers';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn: () => Promise<boolean>, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await wait(500);
  }
  throw new Error('waitFor 超时');
}

describe('工具页 TDesign 接入 E2E', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await getSharedSession();
    mp = session.miniProgram;
  }, 120000);

  it('settings 页菜单渲染为 t-cell', async () => {
    await navTo(mp, '/pages/settings/settings');
    expect(await currentRoute(mp)).toContain('settings');
    expect(await countSelector(mp, '.settings__menus >>> .t-cell')).toBe(6);
  }, T);

  it('message 页通知流 TDesign（入口 t-cell / 条目 t-avatar / 空态 t-empty）', async () => {
    // reLaunch 重建页面实例：复用 IDE 时 tab 页实例跨会话存活、data 带旧值
    await navTo(mp, '/pages/message/message');
    await waitFor(async () => (await pageData<boolean>(mp, 'loading')) === false);
    // 顶部入口（谁看过我/喜欢我的）为静态结构，恒渲染 2 个 t-cell
    expect(await countSelector(mp, '.message__entries >>> .t-cell')).toBe(2);
    // 通知条目按账号数据二选一：有条目 → 每条一个 t-avatar；空 → t-empty 空态
    const entries = await pageData<unknown[]>(mp, 'entries');
    if (Array.isArray(entries) && entries.length > 0) {
      await waitFor(
        async () => (await countSelector(mp, '.message__item >>> .t-avatar')) === entries.length
      );
      expect(await countSelector(mp, '.message__item >>> .t-avatar')).toBe(entries.length);
    } else {
      await waitFor(async () => (await countSelector(mp, '.message__empty')) === 1);
      expect(await countSelector(mp, '.message__empty')).toBe(1);
    }
  }, T);
});
