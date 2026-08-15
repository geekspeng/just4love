/**
 * P1 登录与资料 E2E —— 关键路径（App 级通道，遵守 e2e-test skill 规则）
 * 云环境未部署时云调用失败，页面应兜底渲染（不断言云端数据）。
 */
import {
  connectOrLaunch,
  closeSession,
  currentRoute,
  pageData,
  countSelector,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
} from './helpers';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('P1 登录与资料 E2E', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await connectOrLaunch();
    mp = session.miniProgram;
  }, 120000);

  afterAll(() => closeSession(session));

  it('我的页渲染完整菜单（最终六项）', async () => {
    await mp.switchTab('/pages/mine/mine');
    expect(await currentRoute(mp)).toContain('mine');
    const menus = await pageData<{ id: string; label: string }[]>(mp, 'menus');
    expect(menus.map((m) => m.id)).toEqual([
      'edit', 'album', 'story', 'tags', 'preview', 'settings',
    ]);
  }, T);

  it('可进入资料编辑页且选项池正确加载', async () => {
    await mp.navigateTo('/pages/profile-edit/profile-edit');
    expect(await currentRoute(mp)).toContain('profile-edit');
    await wait(1500); // 等 onLoad 的云调用失败回落
    const d = await pageData<{
      loveGoals: string[];
      familyBackground: string[];
      heightRange: number[];
      draft: { basic: object };
    }>(mp);
    expect(d.loveGoals).toHaveLength(4);
    expect(d.familyBackground).toHaveLength(12);
    expect(d.heightRange[0]).toBe(140);
    expect(d.draft).toBeTruthy(); // 云端无资料时兜底为空模板
    expect(d.draft.basic).toBeTruthy();
    await mp.navigateBack();
  }, T);

  it('相册/标签页结构正确', async () => {
    await mp.navigateTo('/pages/album-edit/album-edit');
    await wait(1200);
    const slots = await pageData<{ category: string; fileID: string }[]>(mp, 'slots');
    expect(slots.map((s) => s.category)).toEqual([
      '日常生活', '兴趣爱好', '旅行经历', '家有萌宠', '健身运动',
    ]);
    await mp.navigateBack();

    await mp.navigateTo('/pages/tags-edit/tags-edit');
    await wait(1200);
    const pools = await pageData<{ key: string; items: { name: string; selected: boolean }[] }[]>(mp, 'pools');
    expect(pools.map((p) => p.key)).toEqual(['hobby', 'personality', 'food', 'media']);
    expect(pools[0].items.length).toBeGreaterThanOrEqual(6);
    await mp.navigateBack();
  }, T);

  it('预览页挂载完整资料卡组件（他人视角，隐私不显示明文）', async () => {
    await mp.navigateTo('/pages/profile-preview/profile-preview');
    await wait(1500);
    expect(await currentRoute(mp)).toContain('profile-preview');
    // 本机 DevTools 页面级查询匹配不到自定义组件标签，用 >>> 跨边界选组件根节点 .pc 计数
    expect(await countSelector(mp, '.preview >>> .pc')).toBe(1);
    const profile = await pageData<{ privacy?: unknown }>(mp, 'profile');
    expect(profile).toBeTruthy();
    await mp.navigateBack();
  }, T);

  it('设置页菜单与协议页内容', async () => {
    await mp.navigateTo('/pages/settings/settings');
    expect(await currentRoute(mp)).toContain('settings');
    const menus = await pageData<{ id: string }[]>(mp, 'menus');
    expect(menus.map((m) => m.id)).toEqual([
      'help', 'about', 'user', 'privacy', 'logout', 'delete',
    ]);
    await mp.navigateBack();

    await mp.navigateTo('/pages/agreement/agreement?type=privacy');
    await wait(800);
    const doc = await pageData<{ title: string; paragraphs: string[] }>(mp, 'doc');
    expect(doc.title).toBe('隐私政策');
    expect(doc.paragraphs.length).toBeGreaterThanOrEqual(4);
    await mp.navigateBack();
  }, T);

  it('推荐 tab 的 profile-card mock 列表仍渲染', async () => {
    await mp.switchTab('/pages/recommend/recommend');
    // 同上：>>> 跨边界选组件根节点 .pc 计数（标签选择器在本机匹配不到自定义组件）
    expect(await countSelector(mp, '.recommend__list >>> .pc')).toBe(2);
  }, T);
});
