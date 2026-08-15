/**
 * E2E 测试共享基础设施（miniprogram-automator）
 *
 * 【重要】本项目 E2E 建立在 App 级通道（evaluate / switchTab）上：
 *   - 可用：miniProgram.evaluate / switchTab / reLaunch / navigateTo / pageStack / callWxMethod
 *   - 不可用：page.$() / page.data() / element.text() 等 Page 级渲染协议
 *     （在本机 DevTools 2.01.2510290 上会挂起，勿用官方示例的 page.$ 写法）
 *
 * 断言原语（currentRoute / pageData / countSelector / runInApp）
 * 内部用 getCurrentPages + wx.createSelectorQuery，已验证可靠。
 */
import { existsSync } from 'fs';
import net from 'net';
import automator from 'miniprogram-automator';
import config from '../e2e.config';

// automator 的 MiniProgram 类未从包顶层导出，用 ReturnType 派生实例类型
export type MiniProgram = Awaited<ReturnType<typeof automator.launch>>;

// getCurrentPages / wx 的类型声明见同目录 app-globals.d.ts（evaluate 回调上下文）

/** 探测端口是否已被监听 */
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

export interface ConnectedSession {
  miniProgram: MiniProgram;
}

/**
 * 连接或启动自动化会话：
 *   - 端口已被监听（DevTools 已带 --auto-port 运行）→ automator.connect
 *   - 否则 → automator.launch 新起 DevTools
 * 用法：
 *   const session = await connectOrLaunch();
 *   afterAll(() => closeSession(session));
 */
export async function connectOrLaunch(): Promise<ConnectedSession> {
  if (!existsSync(config.cliPath)) {
    throw new Error(
      `未找到微信开发者工具 CLI：${config.cliPath}\n` +
        'E2E 需要在装有微信开发者工具的本机运行：\n' +
        '  1. 安装并登录微信开发者工具\n' +
        '  2. 设置 → 安全设置 → 开启「服务端口」\n' +
        '  3. 检查 tests/e2e.config.ts 中的 cliPath 是否正确\n'
    );
  }
  if (await isPortOpen(config.port)) {
    const miniProgram = await automator.connect({
      wsEndpoint: `ws://localhost:${config.port}`,
    });
    return { miniProgram };
  }
  const miniProgram = await automator.launch({
    cliPath: config.cliPath,
    projectPath: config.projectPath,
    port: config.port,
  });
  return { miniProgram };
}

/**
 * 会话清理（每个测试文件的 afterAll 调用）：关闭自动化会话。
 * 注意：connect 到的会话也会被关闭——若你正手动开着 DevTools 调试，跑 e2e 前请自行保存。
 *
 * miniProgram.close() 只结束自动化会话，DevTools 主进程仍存活（实测），
 * IDE 的退出由 jest globalTeardown（e2e-teardown.js 的 cli quit）统一完成——
 * 不能在 per-file 的 afterAll 里 quit，否则下一个测试文件 launch 时会撞上正在退出的 IDE。
 */
export async function closeSession(session: ConnectedSession | undefined): Promise<void> {
  if (!session) return;
  await session.miniProgram.close();
}

// ---- 断言原语（全部走 evaluate，勿改回 page.$ 通道）----

/** 当前页面路由，如 "pages/recommend/recommend" */
export function currentRoute(mp: MiniProgram): Promise<string> {
  return mp.evaluate(() => getCurrentPages().slice(-1)[0].route);
}

/** 当前页面 data（或 data[path]） */
export function pageData<T = unknown>(mp: MiniProgram, path?: string): Promise<T> {
  return mp.evaluate((p?: string) => {
    const page = getCurrentPages().slice(-1)[0];
    return p ? page.data[p] : page.data;
  }, path) as Promise<T>;
}

/** 统计当前页面匹配选择器的元素个数（可用于页面级 class/tag） */
export function countSelector(mp: MiniProgram, selector: string): Promise<number> {
  return mp.evaluate(
    (s: string) =>
      new Promise<number>((resolve) => {
        wx.createSelectorQuery().selectAll(s).fields({ id: true }).exec((res) => {
          resolve((res[0] || []).length);
        });
      }),
    selector
  );
}

/** 在小程序上下文执行任意函数并取回返回值（须可序列化） */
export function runInApp<T = unknown>(mp: MiniProgram, fn: () => T): Promise<T> {
  return mp.evaluate(fn) as Promise<T>;
}

/**
 * 页面跳转（替代 mp.navigateTo —— 本机 DevTools 2.01.2510290 上 wx.navigateTo
 * 挂死：success/fail 均不回调，automator 的 navigateTo 随之 10s 超时报
 * "Uncaught [object Object]"，实测 2026-08）。
 * 改走 App 级 evaluate + wx.reLaunch：任意页面（含非 tab）可达，且不依赖页面栈，
 * 因此测试中也不需要配对的 navigateBack——下一个断言用 navTo/switchTab 离开即可。
 */
export function navTo(mp: MiniProgram, url: string): Promise<void> {
  return mp.evaluate(
    (u: string) =>
      new Promise<void>((resolve, reject) => {
        wx.reLaunch({
          url: u,
          success: () => resolve(),
          fail: (e) => reject(new Error((e && e.errMsg) || 'reLaunch fail')),
        });
      }),
    url
  );
}

/** 统一的单用例超时：DevTools 通信慢，jest 默认 5s 不够 */
export const TEST_TIMEOUT = 30000;
