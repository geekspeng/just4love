/**
 * E2E 测试 —— miniprogram-automator
 *
 * 运行前置（仅本机）：
 *   1. 安装并登录「微信开发者工具」
 *   2. 设置 → 安全设置 → 开启「服务端口」
 *   3. 确认 tests/e2e.config.ts 中 cliPath / port 正确
 *
 * 运行：npm run test:e2e
 */
import automator from 'miniprogram-automator';
import config from '../e2e.config';

// automator 的 MiniProgram / Page 类未从包顶层导出，
// 用 ReturnType 派生实例类型，避免依赖内部模块。
type MiniProgram = Awaited<ReturnType<typeof automator.launch>>;
type Page = NonNullable<Awaited<ReturnType<MiniProgram['currentPage']>>>;

describe('just4love E2E', () => {
  let miniProgram: MiniProgram;

  beforeAll(async () => {
    // automator.launch 已返回连接好的 MiniProgram 实例
    miniProgram = await automator.launch({
      cliPath: config.cliPath,
      projectPath: config.projectPath,
      port: config.port,
    });
  }, 60000);

  afterAll(async () => {
    if (miniProgram) {
      await miniProgram.close();
    }
  });

  // 取当前页（currentPage 可能返回 undefined，helper 收窄为非空）
  async function currentPage(): Promise<Page> {
    const page = await miniProgram.currentPage();
    if (!page) throw new Error('当前没有活动页面');
    return page;
  }

  it('启动后默认落在「推荐」页', async () => {
    const page = await currentPage();
    expect(page.path).toContain('recommend');
  });

  it('推荐页渲染了推荐卡片，含昵称', async () => {
    const page = await currentPage();
    // 官方风格：page.$(selector) → element.tagName / element.text()
    const card = await page.$('.rc');
    expect(card).not.toBeNull();
    expect(card!.tagName).toBe('view');

    const name = await page.$('.rc__name');
    expect(name).not.toBeNull();
    expect(await name!.text()).toContain('小鱼');
  });

  it('推荐页卡片展示格式化后的身高', async () => {
    const page = await currentPage();
    const meta = await page.$('.rc__meta');
    expect(meta).not.toBeNull();
    expect(await meta!.text()).toContain('165cm');
  });

  it('切换到「消息」tab 并校验会话列表', async () => {
    await miniProgram.switchTab('/pages/message/message');
    const page = await currentPage();
    expect(page.path).toContain('message');

    const session = await page.$('.message__item');
    expect(session).not.toBeNull();
    const last = await page.$('.message__last');
    expect(await last!.text()).toContain('你好');
  });

  it('切换到「我的」tab 并校验资料卡片', async () => {
    await miniProgram.switchTab('/pages/mine/mine');
    const page = await currentPage();
    expect(page.path).toContain('mine');

    const name = await page.$('.mine__name');
    expect(name).not.toBeNull();
    expect(await name!.text()).toContain('登录');
  });

  it('点击「我的」页菜单项触发交互', async () => {
    const page = await currentPage();
    const menu = await page.$('.mine__menu');
    expect(menu).not.toBeNull();
    // 官方风格：element.tap() 触发点击
    await menu!.tap();
  });

  it('切回「推荐」tab', async () => {
    await miniProgram.switchTab('/pages/recommend/recommend');
    const page = await currentPage();
    expect(page.path).toContain('recommend');
  });
});
