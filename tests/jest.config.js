// Jest 配置 —— 用 projects 区分 unit / integration / e2e 三套测试环境
const path = require('path');

// 项目根目录（project.config.json 所在）
const root = path.resolve(__dirname, '..');

module.exports = {
  projects: [
    {
      displayName: 'unit',
      rootDir: root,
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      setupFiles: ['<rootDir>/tests/jest.setup.js'],
      // miniprogram-simulate 依赖浏览器 DOM 环境
      testEnvironment: 'jsdom',
      transform: {},
    },
    {
      displayName: 'integration',
      rootDir: root,
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      setupFiles: ['<rootDir>/tests/jest.setup.js'],
      testEnvironment: 'node',
      transform: {},
    },
    {
      displayName: 'e2e',
      rootDir: root,
      // E2E 用 TS 编写，由 ts-jest 转换
      testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
      // 整套 e2e 结束后退出微信开发者工具（cli quit，一次性，勿挪进各文件的 afterAll）
      globalTeardown: '<rootDir>/tests/e2e/teardown.js',
      testEnvironment: 'node',
      // 单用例超时（launch DevTools 可能较慢）；也防止 CLI 缺失时无限等待
      testTimeout: 120000,
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: {
              target: 'ES2019',
              module: 'CommonJS',
              esModuleInterop: true,
              skipLibCheck: true,
              strict: true,
              types: ['jest', 'node'],
              lib: ['ES2019'],
            },
          },
        ],
      },
    },
  ],
};
