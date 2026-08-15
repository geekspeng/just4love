// app.js —— just4love 小程序入口
const { ensureLogin, getCachedUser } = require('./utils/auth.js');

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

    // 登录态：先从本地缓存恢复（同步，立即可用），再后台静默登录/刷新
    const cached = getCachedUser();
    if (cached) {
      this.globalData.user = cached;
    }
    ensureLogin().then((user) => {
      if (user) {
        this.globalData.user = user;
      }
      this.globalData.loginReady = true;
    });
  },

  globalData: {
    // 登录态（UserVO）、登录完成标记；资料数据由各页面自行拉取
    user: null,
    loginReady: false,
  },
});
