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
import { execFile } from 'child_process';
import automator from 'miniprogram-automator';
import config from '../e2e.config';

// 子进程执行（重试清理里 quit IDE 用）
const execFileAsync = (cmd: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    execFile(cmd, args, (err) => (err ? reject(err) : resolve()));
  });

/**
 * 协议级就绪探测：原始 websocket 发 Tool.getInfo，SDKVersion 非空才算 IDE 可用。
 * 背景（2026-08-21 实测）：IDE 冷启动 >30s，automator.launch 在端口一开就发
 * Tool.getInfo，未就绪的 IDE 返回空 result → checkVersion 对 undefined 调 split 崩。
 * 先用本探测等就绪、再 automator.connect，绕开 automator 的 launch 握手竞态。
 */
function probeIdeReady(port: number, timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    let ws: { close: () => void; send: (d: string) => void; on: (ev: string, fn: (arg?: unknown) => void) => void } | null = null;
    const done = (ok: boolean) => {
      try { ws && ws.close(); } catch { /* ignore */ }
      resolve(ok);
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const WebSocket = require('ws');
      const sock = new WebSocket(`ws://localhost:${port}`);
      ws = sock;
      const timer = setTimeout(() => done(false), timeoutMs);
      sock.on('open', () => {
        sock.send(JSON.stringify({ id: 1, method: 'Tool.getInfo', params: {} }));
      });
      sock.on('message', (d: unknown) => {
        clearTimeout(timer);
        try {
          const msg = JSON.parse(String(d));
          done(!!(msg.result && msg.result.SDKVersion));
        } catch {
          done(false);
        }
      });
      sock.on('error', () => { clearTimeout(timer); done(false); });
    } catch {
      done(false);
    }
  });
}

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

// 共享会话 stash：--runInBand 下 jest 每文件重建模块注册表（模块级变量跨不了文件），
// 但 process 是同一真实对象——挂在 process 上即可跨测试文件共享（teardown.js 也读它）
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Process {
      __j4lE2eSession?: ConnectedSession;
    }
  }
}

/**
 * 连接或启动自动化会话：
 *   - 端口通且协议就绪（Tool.getInfo 有 SDKVersion）→ automator.connect
 *   - 否则 automator.launch 新起 DevTools，直接使用返回的会话
 * 冷启动竞态兜底（2026-08-21 实测，IDE 2.02 + 冷启动 >30s）：
 *   a) launch 的 checkVersion 在 IDE 未就绪时对 undefined 调 split 崩 → 捕获后
 *      以协议级探测轮询就绪（≤120s）再 connect；
 *   b) 对刚 launch 成功的会话切忌 close() 后重连——会把自动化服务打进
 *      「端口在、连接即断」的坏态；全程只由 teardown.js 统一 close 一次。
 * 会话建立后做一次 evaluate 探活，失败视为半初始化 → quit + 冷却后整轮重来（≤3 次）。
 * 仅供 getSharedSession 内部调用建立会话，测试文件勿直接使用。
 */
async function connectOrLaunch(): Promise<ConnectedSession> {
  if (!existsSync(config.cliPath)) {
    throw new Error(
      `未找到微信开发者工具 CLI：${config.cliPath}\n` +
        'E2E 需要在装有微信开发者工具的本机运行：\n' +
        '  1. 安装并登录微信开发者工具\n' +
        '  2. 设置 → 安全设置 → 开启「服务端口」\n' +
        '  3. 检查 tests/e2e.config.ts 中的 cliPath 是否正确\n'
    );
  }
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      let miniProgram;
      if (await isPortOpen(config.port)) {
        // IDE 已在运行：协议级就绪才 connect（未就绪多半是上个会话残留，quit 后重来）
        if (await probeIdeReady(config.port)) {
          miniProgram = await automator.connect({ wsEndpoint: `ws://localhost:${config.port}` });
        }
      }
      if (!miniProgram) {
        // 冷启动：launch 成功则直接使用该会话（切忌 close 后重连——实测会把自动化服务
        // 打进「端口在、连接即断」的坏态）；launch 撞上冷启动竞态（checkVersion 对
        // undefined 调 split 崩）则等协议就绪再 connect
        try {
          miniProgram = await automator.launch({
            cliPath: config.cliPath,
            projectPath: config.projectPath,
            port: config.port,
          });
        } catch (launchErr) {
          console.warn(`[connectOrLaunch] launch 失败（${String(launchErr).slice(0, 80)}），等待就绪后 connect`);
          const ready = await new Promise<boolean>((resolve) => {
            const deadline = Date.now() + 120000;
            const tick = async () => {
              if (await probeIdeReady(config.port)) return resolve(true);
              if (Date.now() > deadline) return resolve(false);
              setTimeout(tick, 3000);
            };
            tick();
          });
          if (!ready) throw new Error('IDE 协议就绪探测超时（Tool.getInfo 无 SDKVersion）');
          miniProgram = await automator.connect({ wsEndpoint: `ws://localhost:${config.port}` });
        }
      }
      // 探活：只验证协议响应（evaluate 算术），不赌页面栈——冷启动时 getCurrentPages()
      // 可能为空，用路由做判据会把健康会话误杀。半初始化会话在 evaluate 上挂/超时。
      const pong = await Promise.race([
        miniProgram.evaluate(() => 1 + 1),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('probe evaluate 超时')), 10000)
        ),
      ]);
      if (pong !== 2) throw new Error('probe 响应异常: ' + String(pong));
      return { miniProgram };
    } catch (e) {
      lastErr = e;
      console.warn(`[connectOrLaunch] 第 ${attempt} 次会话不可用，重试：${String(e).slice(0, 120)}`);
      // 清理残留：IDE 整体退出，下次循环走干净 launch
      try {
        await execFileAsync(config.cliPath, ['quit']);
      } catch {
        /* quit 失败不阻断重试 */
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('connectOrLaunch 三次重试均失败：' + String(lastErr));
}

/**
 * 获取全程共享的自动化会话（每个测试文件的 beforeAll 调；teardown.js 统一关闭）：
 *   - 首个套件建立会话（launch/connect，含冷启动竞态兜底）挂到 process；
 *   - 后续套件探活通过直接复用——全程一次建立、一次关闭。
 * 为何不再 per-file close：实测 close→重连会把自动化服务打进「端口在、连接即断」坏态；
 * 且共享后会话永远单所有者，重试清理里的 cli quit 不会再误杀邻居套件的 IDE。
 * 会话中途死掉（如 Connection closed）→ 探活失败自动重建，不影响后续套件。
 * 注意：miniProgram.close() 只结束自动化会话不杀 IDE 进程，IDE 退出由
 * teardown.js 的 cli quit 统一做一次（勿挪回任何测试文件的 afterAll）。
 */
export async function getSharedSession(): Promise<ConnectedSession> {
  // runInBand 守卫：--runInBand 下测试与 jest 主进程同进程（argv 带 --runInBand），
  // process 上的 stash 才能跨文件共享；worker 模式各 worker 独立进程会各起 IDE 抢端口。
  // 注意 JEST_WORKER_ID 在 in-band 下也为 '1'，不能用作判据（2026-08-22 实测）。
  const inBand =
    process.env.JEST_WORKER_ID === undefined ||
    process.argv.some((a) => a === '--runInBand' || a === '-i' || a.startsWith('--runInBand='));
  if (!inBand) {
    throw new Error(
      'E2E 须 --runInBand 运行：共享会话挂在 process 上，多 worker 会各持一份并争抢自动化端口。请用 npm run test:e2e'
    );
  }
  const stashed = process.__j4lE2eSession;
  if (stashed) {
    try {
      const pong = await Promise.race([
        stashed.miniProgram.evaluate(() => 1 + 1),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('共享会话探活超时')), 5000)
        ),
      ]);
      if (pong === 2) {
        console.log('[e2e] 复用共享会话');
        return stashed;
      }
      throw new Error('探活响应异常: ' + String(pong));
    } catch (e) {
      console.warn(`[e2e] 共享会话已失活（${String(e).slice(0, 80)}），重建`);
      try { await stashed.miniProgram.close(); } catch { /* 死会话，close 失败忽略 */ }
      delete process.__j4lE2eSession;
    }
  }
  const session = await connectOrLaunch();
  process.__j4lE2eSession = session;
  console.log('[e2e] 新建会话（全程共享，teardown 统一关闭）');
  return session;
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
