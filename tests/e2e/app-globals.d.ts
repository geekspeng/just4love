// E2E evaluate 回调在小程序运行时执行，那里存在全局 getCurrentPages / wx。
// 此声明让所有 e2e 测试文件的回调通过 Node 侧 TS 检查。
// （tests/e2e/*.test.ts 和 helpers.ts 均依赖，勿删）
declare function getCurrentPages(): Array<{
  route: string;
  data: Record<string, unknown>;
  // 页面方法（onInput/onSave 等）动态定义，供测试直接驱动页面交互
  [key: string]: any;
}>;
declare const wx: {
  createSelectorQuery: () => {
    selectAll: (selector: string) => {
      fields: (opt: { id: boolean }) => {
        exec: (cb: (res: Array<Array<unknown>>) => void) => void;
      };
    };
  };
  // 真实云函数链路验证（wx.cloud.init 已在 app.js onLaunch 完成）
  cloud: {
    callFunction: (opt: { name: string; data?: Record<string, unknown> }) => Promise<{ result: any }>;
  };
  // 登录态缓存
  getStorageSync: (key: string) => any;
  clearStorageSync: () => void;
  // 导航 API（本机实测 navigateTo 挂死，reLaunch/redirectTo/switchTab/navigateBack 可用）
  reLaunch: (opt: NavOption) => void;
  redirectTo: (opt: NavOption) => void;
  switchTab: (opt: NavOption) => void;
  navigateBack: (opt: NavOption) => void;
};

interface NavOption {
  url?: string;
  success?: () => void;
  fail?: (e: { errMsg?: string }) => void;
}
