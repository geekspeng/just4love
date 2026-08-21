// pages/mine/mine.js —— 【我的】tab（登录态 + 资料概览 + 功能入口）
const { callFunction } = require('../../utils/request.js');
const { ensureLogin, getCachedUser } = require('../../utils/auth.js');

// 菜单入口：已接通的 id → navigateTo；未接通的保持 toast 占位。
// 菜单按登录态动态构建（P4）：所有人可见「我的认证/加入交友群」，管理员追加「管理后台」。
const WIRED = {
  edit: '/pages/profile-edit/profile-edit',
  album: '/pages/album-edit/album-edit',
  story: '/pages/story-edit/story-edit',
  tags: '/pages/tags-edit/tags-edit',
  preview: '/pages/profile-preview/profile-preview',
  verify: '/pages/verification/verification',
  group: '/pages/group-qrcode/group-qrcode',
  admin: '/pages/admin/admin',
  settings: '/pages/settings/settings',
};

function buildMenus(role) {
  const menus = [
    { id: 'edit', label: '编辑资料' },
    { id: 'album', label: '我的相册' },
    { id: 'story', label: '我的故事' },
    { id: 'tags', label: '我的标签' },
    { id: 'preview', label: '预览我的资料卡' },
    { id: 'verify', label: '我的认证' },
    { id: 'group', label: '加入交友群' },
  ];
  if (role === 'admin') menus.push({ id: 'admin', label: '管理后台' });
  menus.push({ id: 'settings', label: '设置' });
  return menus;
}

Page({
  data: {
    user: null,           // UserVO | null
    profileSummary: null, // { nickname, signature, avatarFileID }
    menus: buildMenus(),
  },

  async onShow() {
    const cached = getCachedUser();
    if (cached) this.setData({ user: cached, menus: buildMenus(cached.role) });
    const user = await ensureLogin();
    if (user) this.setData({ user, menus: buildMenus(user.role) });
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
