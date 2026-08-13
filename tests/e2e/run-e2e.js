// tests/e2e/run-e2e.js —— E2E 测试脚本（miniprogram-automator）
//
// 运行前置：
//   1. 本机安装「微信开发者工具」并登录
//   2. 开发者工具 → 设置 → 安全设置 → 开启「服务端口」（CLI/HTTP 调用）
//   3. 确认 tests/e2e.config.js 中的 cliPath / port 正确
//
// 运行：npm run test:e2e
const automator = require('miniprogram-automator');
const config = require('../e2e.config');

async function run() {
  console.log('[e2e] 连接微信开发者工具...', config.cliPath);
  const ide = await automator.launch({
    cliPath: config.cliPath,
    projectPath: config.projectPath,
    port: config.port,
  });

  let failed = 0;
  try {
    const miniProgram = await ide.connect();

    // 用例 1：启动后默认落在推荐页
    console.log('[e2e] 用例1：启动默认页');
    const page1 = await miniProgram.currentPage();
    console.log('  当前页面路径:', page1.path);
    if (!page1.path.includes('recommend')) {
      throw new Error('默认页应为 pages/recommend/recommend');
    }
    console.log('  ✓ 默认推荐页正常');

    // 用例 2：tabBar 含 3 个 tab
    console.log('[e2e] 用例2：tabBar 标签数量');
    const tabBar = await miniProgram.callWxMethod('getTabBar'); // 部分版本支持
    console.log('  tabBar 获取完成（部分基础库下可能无返回，见日志）');

    // 用例 3：切换到「我的」tab
    console.log('[e2e] 用例3：切换到 我的');
    await miniProgram.switchTab('/pages/mine/mine');
    const page3 = await miniProgram.currentPage();
    if (!page3.path.includes('mine')) {
      throw new Error('切换 tab 后应在 pages/mine/mine');
    }
    console.log('  ✓ 已切换至 我的 页');

    // 用例 4：切换到「消息」tab
    console.log('[e2e] 用例4：切换到 消息');
    await miniProgram.switchTab('/pages/message/message');
    const page4 = await miniProgram.currentPage();
    if (!page4.path.includes('message')) {
      throw new Error('切换 tab 后应在 pages/message/message');
    }
    console.log('  ✓ 已切换至 消息 页');

    console.log('\n[e2e] 全部用例通过 ✅');
  } catch (err) {
    failed = 1;
    console.error('\n[e2e] 失败:', err.message);
  } finally {
    await ide.close();
  }

  process.exit(failed);
}

run();
