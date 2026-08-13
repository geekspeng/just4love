// Jest 配置 —— 用 projects 区分 unit / integration 两套测试环境
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
  ],
};
