// app.js —— just4love 小程序入口
App({
  onLaunch() {
    // 初始化云开发。
    // env 为占位环境 ID，创建云环境后在微信开发者工具 → 云开发 面板获取真实 env 并替换。
    if (wx.cloud) {
      wx.cloud.init({
        env: 'just4love-env',
        traceUser: true,
      });
    } else {
      console.warn('[just4love] 当前基础库不支持 wx.cloud，请升级微信开发者工具。');
    }
  },

  globalData: {
    // 登录态、用户信息等全局状态后续在此扩展
    userInfo: null,
  },
});
