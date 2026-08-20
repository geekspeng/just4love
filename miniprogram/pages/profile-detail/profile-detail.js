// pages/profile-detail/profile-detail.js —— 嘉宾资料详情（遇见列表/分享落地进入）
// 状态优先级：needLogin（游客）> quotaExceeded > notFound > loadError > 正常渲染。
// P3：心动互配/无感/隐私申请/联系方式查看全部激活；聊天=解锁后展示并复制（导流微信，不自建 IM）。
const { callFunction } = require('../../utils/request.js');
const { ensureLogin, clearLogin } = require('../../utils/auth.js');

Page({
  data: {
    profile: null,
    verified: false,
    self: false,
    quota: null,
    consents: { contact: 'none', asset: 'none' }, // none/pending/approved/rejected/revoked
    needLogin: false,
    quotaExceeded: false,
    notFound: false,
    loadError: false,   // 云调用失败（网络/未部署），区别于 notFound（P2 终审遗留）
    profileId: '',
    interacting: false, // 按钮防重
    requesting: '',     // 正在申请的字段（contact/asset），防重
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
      // 云调用失败 ≠ 嘉宾不存在：单独状态，给重试入口
      this.setData({ loadError: true });
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
      consents: res.consents || { contact: 'none', asset: 'none' },
      notFound: false,
      loadError: false,
    });
  },

  onRetryLoad() {
    this.setData({ loadError: false });
    this.loadDetail(this.data.profileId);
  },

  // 游客引导：静默登录后重试；缓存与服务端档不一致时强刷一次（P2 终审遗留）
  async onLoginRetry() {
    let user = await ensureLogin();
    this.setData({ needLogin: false });
    await this.loadDetail(this.data.profileId);
    if (!user || this.data.needLogin) {
      clearLogin();
      user = await ensureLogin(); // 强制走云函数 login 重建档
      if (user) {
        this.setData({ needLogin: false });
        await this.loadDetail(this.data.profileId);
      }
    }
    if (!user) {
      wx.showToast({ title: '登录失败，请稍后再试', icon: 'none' });
    }
  },

  // 心动：互配成功弹窗引导申请联系方式
  async onLike() {
    if (this.data.interacting) return;
    this.setData({ interacting: true });
    const res = await callFunction('interact', { targetProfileId: this.data.profileId, type: 'like' });
    this.setData({ interacting: false });
    if (!res || res.error) {
      wx.showToast({ title: '操作失败，请稍后再试', icon: 'none' });
      return;
    }
    if (res.matched) {
      const that = this;
      wx.showModal({
        title: '匹配成功！',
        content: '你们互相心动，可申请查看对方联系方式，交换后去微信聊天',
        confirmText: '申请联系方式',
        success: (m) => {
          if (m.confirm) that.onRequestConsent('contact');
        },
      });
    } else {
      wx.showToast({ title: '已心动，互相心动即匹配', icon: 'none' });
    }
  },

  // 无感：记录后返回列表（列表不再出现该嘉宾）
  async onPass() {
    if (this.data.interacting) return;
    this.setData({ interacting: true });
    const res = await callFunction('interact', { targetProfileId: this.data.profileId, type: 'pass' });
    this.setData({ interacting: false });
    if (!res || res.error) {
      wx.showToast({ title: '操作失败，请稍后再试', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已无感', icon: 'none' });
    setTimeout(() => wx.navigateBack({ fail: () => {} }), 600);
  },

  // 聊天：联系方式已解锁 → 展示并复制微信号；未解锁 → 引导互配（导流微信，不自建 IM）
  onChat() {
    const contact = this.data.profile && this.data.profile.privacy && this.data.profile.privacy.contact;
    if (contact && (contact.wechat || contact.phone)) {
      const text = contact.wechat || contact.phone;
      wx.showModal({
        title: '对方联系方式',
        content: '微信号：' + (contact.wechat || '未填写') + '\n手机号：' + (contact.phone || '未填写'),
        confirmText: '复制' + (contact.wechat ? '微信号' : '手机号'),
        success: (m) => {
          if (m.confirm) {
            wx.setClipboardData({ data: text, fail: () => {} });
          }
        },
      });
      return;
    }
    wx.showToast({ title: '互相心动后可申请查看联系方式', icon: 'none' });
  },

  // 隐私字段申请（field: contact | asset；兼容按钮 dataset 事件与 onLike 弹窗字符串直调两种形态）
  async onRequestConsent(e) {
    const field = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.field) || (typeof e === 'string' ? e : '');
    if (!field) return;
    if (this.data.requesting) return;
    this.setData({ requesting: field });
    const res = await callFunction('requestConsent', { ownerProfileId: this.data.profileId, field });
    this.setData({ requesting: '' });
    if (!res || res.error) {
      wx.showToast({ title: (res && res.error === 'cannot request self') ? '自己的资料无需申请' : '申请失败，请稍后再试', icon: 'none' });
      return;
    }
    this.setData({ ['consents.' + field]: res.status || 'pending' });
    wx.showToast({ title: res.status === 'approved' ? '对方已同意，已解锁' : '已发送申请，等待对方同意', icon: 'none' });
  },

  // 举报入口 → 举报表单页（T10 提供页面后接通；本任务先留跳转）
  onReport() {
    wx.navigateTo({ url: '/pages/report/report?id=' + this.data.profileId });
  },

  // 分享转发卡片：落地即本页（游客走登录引导）
  onShareAppMessage() {
    const p = this.data.profile;
    const name = (p && p.basic && p.basic.nickname) || '遇见爱';
    return {
      title: name + ' 的资料卡',
      path: '/pages/profile-detail/profile-detail?id=' + this.data.profileId,
    };
  },
});
