// utils/auth.js —— 登录态管理：本地缓存 + 启动恢复 + 静默登录/刷新 + 手机号绑定
const { callFunction } = require('./request.js');

const STORAGE_KEY = 'j4l_user';
let refreshing = null; // 并发去重

function getCachedUser() {
  try {
    const u = wx.getStorageSync(STORAGE_KEY);
    return u && u.userId ? u : null;
  } catch (e) {
    return null;
  }
}

function saveUser(user) {
  try {
    wx.setStorageSync(STORAGE_KEY, user);
  } catch (e) { /* 存储失败不阻断 */ }
  if (typeof getApp === 'function') {
    getApp().globalData.user = user;
  }
}

// 调 login 云函数（去重并发），成功写缓存与 globalData
function refreshLogin() {
  if (!refreshing) {
    refreshing = callFunction('login').then((res) => {
      refreshing = null;
      if (res && res.user) {
        saveUser(res.user);
        return res.user;
      }
      return null;
    });
  }
  return refreshing;
}

// 入口统一调用：有缓存立即返回缓存（云函数后台静默刷新由调用方 onShow 自行触发），
// 无缓存发起静默登录。失败返回 null，调用方保持「未登录」UI。
function ensureLogin() {
  const cached = getCachedUser();
  if (cached) {
    saveUser(cached);
    return Promise.resolve(cached);
  }
  return refreshLogin();
}

function clearLogin() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (e) { /* 忽略 */ }
  if (typeof getApp === 'function') {
    getApp().globalData.user = null;
  }
}

// getPhoneNumber 按钮 code → 手机号；成功后同步缓存
async function bindPhoneWithCode(code) {
  const res = await callFunction('bindPhone', { code });
  if (res && res.phone) {
    const u = getCachedUser();
    if (u) {
      u.phone = res.phone;
      saveUser(u);
    }
  }
  return res;
}

module.exports = { ensureLogin, getCachedUser, clearLogin, bindPhoneWithCode };
