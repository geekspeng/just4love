// pages/profile-detail/profile-detail.js —— 嘉宾资料详情（遇见列表/分享落地进入）
// 状态优先级：needLogin（游客）> quotaExceeded > notFound > 正常渲染。
// 按钮组（心动/聊天/无感）、举报、隐私授权：P3 激活，P2 点击提示「即将开放」。
const { callFunction } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');

Page({
  data: {
    profile: null,
    verified: false,
    self: false,
    quota: null,          // { used, limit }；本人 null、管理员 limit -1
    needLogin: false,     // 游客：显示登录引导
    quotaExceeded: false, // 今日次数用完
    notFound: false,
    profileId: '',
  },

  async onLoad(options) {
    const id = (options && options.id) || '';
    this.setData({ profileId: id });
    await this.loadDetail(id);
  },

  async loadDetail(id) {
    if (!id) {
      this.setData({ notFound: true });
      return;
    }
    const res = await callFunction('getProfileDetail', { profileId: id });
    if (!res) {
      // 云调用失败（request 封装返回 null）按不存在兜底，避免白屏
      this.setData({ notFound: true });
      return;
    }
    if (res.error === 'login required') {
      this.setData({ needLogin: true });
      return;
    }
    if (res.error === 'quota exceeded') {
      this.setData({ quotaExceeded: true, quota: res.quota || null });
      return;
    }
    if (res.error || !res.profile) {
      this.setData({ notFound: true });
      return;
    }
    this.setData({
      profile: res.profile,
      verified: !!res.verified,
      self: !!res.self,
      quota: res.quota || null,
    });
  },

  // 游客引导：静默登录后重试（登录后即为普通用户配额）
  async onLoginRetry() {
    const user = await ensureLogin();
    if (user) {
      this.setData({ needLogin: false });
      await this.loadDetail(this.data.profileId);
    } else {
      wx.showToast({ title: '登录失败，请稍后再试', icon: 'none' });
    }
  },

  // 以下交互 P3 激活，P2 占位
  onLike() { wx.showToast({ title: '即将开放', icon: 'none' }); },
  onChat() { wx.showToast({ title: '即将开放', icon: 'none' }); },
  onPass() { wx.showToast({ title: '即将开放', icon: 'none' }); },
  onReport() { wx.showToast({ title: '即将开放', icon: 'none' }); },

  // 分享转发卡片：落地即本页（游客走登录引导，spec §6.5）
  onShareAppMessage() {
    const p = this.data.profile;
    const name = (p && p.basic && p.basic.nickname) || '遇见爱';
    return {
      title: name + ' 的资料卡',
      path: '/pages/profile-detail/profile-detail?id=' + this.data.profileId,
    };
  },
});
