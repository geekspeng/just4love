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

  it('启动后默认落在「推荐」页', async () => {
    expect(await currentRoute(mp)).toContain('recommend');
  }, T);

  it('推荐页渲染了卡片列表容器与两张卡片', async () => {
    expect(await countSelector(mp, '.recommend__list')).toBe(1);
    const list = await pageData<{ nickname: string }[]>(mp, 'list');
    expect(list).toHaveLength(2);
  }, T);

  it('推荐页 mock 数据完整（昵称/身高）', async () => {
    const list = await pageData<{ nickname: string; height: number }[]>(mp, 'list');
    expect(list[0].nickname).toBe('小鱼');
    expect(list[0].height).toBe(165);
    expect(list[1].nickname).toBe('大刘');
  }, T);

  it('切换到「消息」tab 并校验会话列表', async () => {
    await mp.switchTab('/pages/message/message');
    expect(await currentRoute(mp)).toContain('message');

    expect(await countSelector(mp, '.message__item')).toBe(1);
    const sessions = await pageData<{ lastMessage: string }[]>(mp, 'sessions');
    expect(sessions[0].lastMessage).toContain('你好');
  }, T);

  it('切换到「我的」tab 并校验资料卡片与菜单', async () => {
    await mp.switchTab('/pages/mine/mine');
    expect(await currentRoute(mp)).toContain('mine');

    expect(await countSelector(mp, '.mine__menu')).toBe(4);
    const profile = await pageData<{ nickname: string }>(mp, 'profile');
    expect(profile.nickname).toContain('登录');
  }, T);

  it('「我的」页菜单交互可触发（onTapMenu）', async () => {
    const ok = await runInApp(mp, () => {
      const page = getCurrentPages().slice(-1)[0] as unknown as {
        onTapMenu: (e: { currentTarget: { dataset: { id: string } } }) => void;
      };
      page.onTapMenu({ currentTarget: { dataset: { id: 'edit' } } });
      return true;
    });
    expect(ok).toBe(true);
  }, T);

  it('切回「推荐」tab', async () => {
    await mp.switchTab('/pages/recommend/recommend');
    expect(await currentRoute(mp)).toContain('recommend');
  }, T);
});
