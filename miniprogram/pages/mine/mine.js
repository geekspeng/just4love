// pages/mine/mine.js —— 【我的】tab（个人资料）
Page({
  data: {
    profile: {
      nickname: '点击登录',
      avatar: '',
      age: '',
      height: '',
      isLoggedIn: false,
    },
    menus: [
      { id: 'edit', label: '编辑资料' },
      { id: 'album', label: '我的相册' },
      { id: 'vip', label: '会员中心' },
      { id: 'settings', label: '设置' },
    ],
  },

  onTapMenu(e) {
    const { id } = e.currentTarget.dataset;
    wx.showToast({ title: `进入 ${id}`, icon: 'none' });
  },
});
