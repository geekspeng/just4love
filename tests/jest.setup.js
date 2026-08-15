// jest.setup.js —— 在 Node 环境下提供全局 wx 对象的 mock
//
// 小程序运行时注入全局 wx；单测/集成测试在 Node 下跑，需自行 mock。

const cloud = {
  init: jest.fn(),
  callFunction: jest.fn(),
  uploadFile: jest.fn(),
  database: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({ get: jest.fn() })),
      get: jest.fn(),
      add: jest.fn(),
    })),
  })),
};

global.wx = {
  cloud,
  showToast: jest.fn(),
  showModal: jest.fn(),
  navigateTo: jest.fn(),
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  login: jest.fn(),
};

// 每次 setup 后可由单个测试用例覆盖 wx.cloud.callFunction 的返回值
// auth.js 等模块使用 getApp；单测默认桩，个别用例可覆盖 global.getApp
global.getApp = () => (global.__appStub = global.__appStub || { globalData: {} });

module.exports = {};
