// e2e.config.js —— E2E（miniprogram-automator）运行配置
//
// E2E 需要在本机启动微信开发者工具并开启自动化端口（设置 → 安全设置 → CLI/HTTP 调用）。
// 本仓库无法在此环境执行，请在你的本机按 README 步骤运行。
module.exports = {
  // 微信开发者工具 CLI 路径（macOS 默认如下，Windows/Linux 请改）
  cliPath:
    '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  // 项目根目录（project.config.json 所在）
  projectPath: require('path').resolve(__dirname, '..'),
  // 自动化端口，默认 9420
  port: 9420,
};
