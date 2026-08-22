// E2E globalTeardown：整套结束后关闭共享会话并退出微信开发者工具（各一次）。
//
// 会话由第一个测试文件经 helpers.getSharedSession() 建立并挂到 process.__j4lE2eSession
// （--runInBand 单进程跨文件共享）；per-file afterAll 不再关闭——实测 close→重连会把
// 自动化服务打进「端口在、连接即断」的坏态，且多套件重试循环并发 quit 会互杀 IDE。
// IDE 退出只能在这里做一次：前一个文件 quit 后，后一个文件 launch 会撞上正在退出的实例而挂死（实测）。
//
// 注意：若你正手动开着 DevTools 调试，跑 e2e 后它也会被关闭。
// CLI 路径与 tests/e2e.config.ts 的 cliPath 保持一致（此处为 plain JS，无法 require TS 配置）。
const { execFile } = require('child_process');
const { existsSync } = require('fs');

module.exports = async function teardown() {
  // 1) 关闭共享自动化会话（一次）
  const session = process.__j4lE2eSession;
  if (session && session.miniProgram && typeof session.miniProgram.close === 'function') {
    try {
      await session.miniProgram.close();
    } catch (e) {
      console.warn(`[e2e] 关闭共享会话失败（忽略）: ${e && e.message}`);
    }
    delete process.__j4lE2eSession;
  }
  // 2) 退出微信开发者工具（一次）
  const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
  if (!existsSync(cliPath)) return; // 无 CLI 的环境（CI）直接跳过
  await new Promise((resolve) => {
    execFile(cliPath, ['quit'], (err) => {
      if (err) console.warn(`[e2e] 退出微信开发者工具失败（可手动关闭）: ${err.message}`);
      resolve();
    });
  });
};
