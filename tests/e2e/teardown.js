// E2E globalTeardown：整套 e2e 测试结束后退出微信开发者工具。
//
// 为何不在各测试文件的 afterAll 里 quit：--runInBand 下多个文件串行执行，
// 前一个文件 quit IDE 后，后一个文件 launch 时会撞上正在退出的实例而挂死（实测）。
// per-file 的 closeSession 只关闭自动化会话，IDE 退出统一放在这里做一次。
//
// 注意：若你正手动开着 DevTools 调试，跑 e2e 后它也会被关闭。
// CLI 路径与 tests/e2e.config.ts 的 cliPath 保持一致（此处为 plain JS，无法 require TS 配置）。
const { execFile } = require('child_process');
const { existsSync } = require('fs');

module.exports = async function teardown() {
  const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
  if (!existsSync(cliPath)) return; // 无 CLI 的环境（CI）直接跳过
  await new Promise((resolve) => {
    execFile(cliPath, ['quit'], (err) => {
      if (err) console.warn(`[e2e] 退出微信开发者工具失败（可手动关闭）: ${err.message}`);
      resolve();
    });
  });
};
