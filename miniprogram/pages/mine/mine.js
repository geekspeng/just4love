// pages/mine/mine.js —— 【我的】tab（登录态 + 资料概览 + 功能入口）
const { callFunction } = require('../../utils/request.js');
const { ensureLogin, getCachedUser } = require('../../utils/auth.js');

// 菜单入口：后续任务（15/16/17/19）逐个把 id 接通 navigateTo；
// 未接通的保持 toast 占位，避免指向不存在的页面。
const WIRED = {
  edit: '/pages/profile-edit/profile-edit',
};

Page({
  data: {
    user: null,           // UserVO | null
    profileSummary: null, // { nickname, signature, avatarFileID }
    menus: [
      { id: 'edit', label: '编辑资料' },
      { id: 'album', label: '我的相册' },
      { id: 'settings', label: '设置' },
    ],
  },

  async onShow() {
    const cached = getCachedUser();
    if (cached) this.setData({ user: cached });
    const user = await ensureLogin();
    if (user) this.setData({ user });
    const res = await callFunction('getMyProfile');
    if (res && res.profile && res.profile.basic) {
      const b = res.profile.basic;
      this.setData({
        profileSummary: {
          nickname: b.nickname || '',
          signature: b.signature || '',
          avatarFileID: b.avatarFileID || '',
        },
      });
    }
  },

  // 头像区点击：未登录 → 触发登录；已登录 → 进编辑资料（Task 14 接通）
  onTapProfile() {
    if (this.data.user) {
      this.navigateTo_('edit');
      return;
    }
    wx.showToast({ title: '登录中…', icon: 'none' });
    ensureLogin().then((u) => {
      if (u) {
        this.setData({ user: u });
      } else {
        wx.showToast({ title: '登录失败，请检查云环境配置', icon: 'none' });
      }
    });
  },

  onTapMenu(e) {
    const { id } = e.currentTarget.dataset;
    this.navigateTo_(id);
  },

  navigateTo_(id) {
    if (WIRED[id]) {
      wx.navigateTo({ url: WIRED[id] });
    } else {
      wx.showToast({ title: '即将上线', icon: 'none' });
    }
  },
});
