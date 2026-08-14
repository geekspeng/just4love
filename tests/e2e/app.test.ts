/**
 * E2E 测试 —— miniprogram-automator
 *
 * 运行前置（仅本机）：
 *   1. 安装并登录「微信开发者工具」
 *   2. 设置 → 安全设置 → 开启「服务端口」
 *   3. 确认 tests/e2e.config.ts 中 cliPath / port 正确
 *
 * 运行：npm run test:e2e
 *
 * 说明：本套测试使用 automator 的 App 级通道（evaluate / switchTab）做断言。
 * 部分 DevTools 版本的 Page 级渲染协议（page.$ / page.data）会挂起，
 * 而 evaluate 内可完整使用 getCurrentPages / wx.createSelectorQuery，
 * 因此统一走这条通道，断言能力等价（路由 / 数据 / 元素存在性 / 交互）。
 */
import { existsSync } from 'fs';
import net from 'net';
import automator from 'miniprogram-automator';
import config from '../e2e.config';

// automator 的 MiniProgram / Page 类未从包顶层导出，
// 用 ReturnType 派生实例类型，避免依赖内部模块。
type MiniProgram = Awaited<ReturnType<typeof automator.launch>>;

// evaluate 的回调在小程序运行时执行，那里存在全局 getCurrentPages / wx。
// 此处仅做类型声明，让 Node 侧的 TS 不报"找不到名称"。
declare function getCurrentPages(): Array<{ route: string; data: Record<string, unknown> }>;
declare const wx: {
  createSelectorQuery: () => {
    selectAll: (selector: string) => {
      fields: (opt: { id: boolean }) => {
        exec: (cb: (res: Array<Array<unknown>>) => void) => void;
      };
    };
  };
};

// 探测端口是否已被监听
function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1', timeout: 1500 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

describe('just4love E2E', () => {
  let miniProgram: MiniProgram;
  // 标记是 launch（需要 close）还是 connect（只需 disconnect）
  let launchedByUs = false;

  beforeAll(async () => {
    // DevTools CLI 不存在时快速失败，避免 automator 无限等待
    if (!existsSync(config.cliPath)) {
      throw new Error(
        `未找到微信开发者工具 CLI：${config.cliPath}\n` +
          'E2E 需要在装有微信开发者工具的本机运行：\n' +
          '  1. 安装并登录微信开发者工具\n' +
          '  2. 设置 → 安全设置 → 开启「服务端口」\n' +
          '  3. 检查 tests/e2e.config.ts 中的 cliPath 是否正确\n'
      );
    }
    // 若自动化端口已被监听（DevTools 已带 --auto-port 运行），直接 connect；
    // 否则 launch 新起 DevTools。
    if (await isPortOpen(config.port)) {
      miniProgram = await automator.connect({ wsEndpoint: `ws://localhost:${config.port}` });
    } else {
      launchedByUs = true;
      miniProgram = await automator.launch({
        cliPath: config.cliPath,
        projectPath: config.projectPath,
        port: config.port,
      });
    }
  }, 120000);

  afterAll(async () => {
    if (!miniProgram) return;
    if (launchedByUs) {
      await miniProgram.close();
    } else {
      // connect 模式只断开连接，不关闭 DevTools
      miniProgram.disconnect();
    }
  });

  // ---- 断言辅助（基于 evaluate 的可靠通道）----

  /** 当前页面路由，如 "pages/recommend/recommend" */
  function currentRoute(): Promise<string> {
    return miniProgram.evaluate(() => getCurrentPages().slice(-1)[0].route);
  }

  /** 当前页面 data（或 data[path]） */
  function pageData<T = unknown>(path?: string): Promise<T> {
    return miniProgram.evaluate((p?: string) => {
      const page = getCurrentPages().slice(-1)[0];
      return (p ? page.data[p] : page.data) as unknown;
    }, path) as Promise<T>;
  }

  /** 统计当前页面匹配选择器的元素个数 */
  function countSelector(selector: string): Promise<number> {
    return miniProgram.evaluate(
      (s: string) =>
        new Promise<number>((resolve) => {
          wx.createSelectorQuery().selectAll(s).fields({ id: true }).exec((res) => {
            resolve((res[0] || []).length);
          });
        }),
      selector
    );
  }

  /** 在小程序上下文执行任意函数 */
  function runInApp<T = unknown>(fn: () => T): Promise<T> {
    return miniProgram.evaluate(fn) as Promise<T>;
  }

  // ---- 用例 ----

  // DevTools 通信较慢，统一 30s 超时（jest 默认 5s 不够）
  const T = 30000;

  it('启动后默认落在「推荐」页', async () => {
    expect(await currentRoute()).toContain('recommend');
  }, T);

  it('推荐页渲染了卡片列表容器与两张卡片', async () => {
    expect(await countSelector('.recommend__list')).toBe(1);
    const list = await pageData<{ nickname: string }[]>('list');
    expect(list).toHaveLength(2);
  }, T);

  it('推荐页 mock 数据完整（昵称/身高）', async () => {
    const list = await pageData<{ nickname: string; height: number }[]>('list');
    expect(list[0].nickname).toBe('小鱼');
    expect(list[0].height).toBe(165);
    expect(list[1].nickname).toBe('大刘');
  }, T);

  it('切换到「消息」tab 并校验会话列表', async () => {
    await miniProgram.switchTab('/pages/message/message');
    expect(await currentRoute()).toContain('message');

    expect(await countSelector('.message__item')).toBe(1);
    const sessions = await pageData<{ lastMessage: string }[]>('sessions');
    expect(sessions[0].lastMessage).toContain('你好');
  }, T);

  it('切换到「我的」tab 并校验资料卡片与菜单', async () => {
    await miniProgram.switchTab('/pages/mine/mine');
    expect(await currentRoute()).toContain('mine');

    expect(await countSelector('.mine__menu')).toBe(4);
    const profile = await pageData<{ nickname: string }>('profile');
    expect(profile.nickname).toContain('登录');
  }, T);

  it('「我的」页菜单交互可触发（onTapMenu）', async () => {
    const ok = await runInApp(() => {
      const page = getCurrentPages().slice(-1)[0] as unknown as {
        onTapMenu: (e: { currentTarget: { dataset: { id: string } } }) => void;
      };
      page.onTapMenu({ currentTarget: { dataset: { id: 'edit' } } });
      return true;
    });
    expect(ok).toBe(true);
  }, T);

  it('切回「推荐」tab', async () => {
    await miniProgram.switchTab('/pages/recommend/recommend');
    expect(await currentRoute()).toContain('recommend');
  }, T);
});
