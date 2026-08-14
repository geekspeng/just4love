// E2E（miniprogram-automator）运行配置
//
// E2E 需要在本机启动微信开发者工具并开启自动化端口：
//   开发者工具 → 设置 → 安全设置 → 开启「服务端口」
// 本仓库无法在无头环境执行，请在你的本机按 README 步骤运行。
import path from 'path';

export interface E2EConfig {
  /** 微信开发者工具 CLI 路径（macOS 默认如下，Windows/Linux 请改） */
  cliPath: string;
  /** 项目根目录（project.config.json 所在） */
  projectPath: string;
  /** 自动化端口，默认 9420 */
  port: number;
}

const config: E2EConfig = {
  cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  projectPath: path.resolve(__dirname, '..'),
  // 自动化端口。注意：这是 automator 的 WebSocket 端口，
  // 与 DevTools「服务端口」（.cli 文件里的 HTTP 端口）不同。
  // 默认 9420；若与本机其他服务冲突可改。
  port: 9420,
};

export default config;
