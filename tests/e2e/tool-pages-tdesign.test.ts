import {
  connectOrLaunch,
  closeSession,
  currentRoute,
  countSelector,
  navTo,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
} from './helpers';

describe('工具页 TDesign 接入 E2E', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await connectOrLaunch();
    mp = session.miniProgram;
  }, 120000);

  afterAll(() => closeSession(session));

  it('settings 页菜单渲染为 t-cell', async () => {
    await navTo(mp, '/pages/settings/settings');
    expect(await currentRoute(mp)).toContain('settings');
    expect(await countSelector(mp, '.settings__menus >>> .t-cell')).toBe(6);
  }, T);

  it('message 页会话渲染 t-avatar', async () => {
    await mp.switchTab('/pages/message/message');
    expect(await countSelector(mp, '.message__item >>> .t-avatar')).toBeGreaterThanOrEqual(1);
  }, T);
});
