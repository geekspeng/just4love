// pages/settings/settings.js —— 设置：帮助/关于/协议/隐私/退出登录/注销
const { callFunction } = require('../../utils/request.js');
const { clearLogin } = require('../../utils/auth.js');

Page({
  data: {
    menus: [
      { id: 'help', label: '帮助' },
      { id: 'about', label: '关于遇见爱' },
      { id: 'user', label: '用户协议' },
      { id: 'privacy', label: '隐私政策' },
      { id: 'logout', label: '退出登录' },
      { id: 'delete', label: '注销账号' },
    ],
  },

  // 推荐给好友：标准小程序分享（落地遇见页，游客走登录引导）
  onShareAppMessage() {
    return {
      title: '遇见爱 · 靠谱相亲，从一份认真填写的资料开始',
      path: '/pages/recommend/recommend',
    };
  },

  onTapMenu(e) {
    const { id } = e.currentTarget.dataset;
    if (['help', 'about', 'user', 'privacy'].indexOf(id) >= 0) {
      wx.navigateTo({ url: '/pages/agreement/agreement?type=' + id });
      return;
    }
    if (id === 'logout') {
      wx.showModal({
        title: '退出登录',
        content: '确定退出当前账号吗？',
        success: (r) => {
          if (!r.confirm) return;
          clearLogin();
          wx.showToast({ title: '已退出', icon: 'success' });
          wx.reLaunch({ url: '/pages/recommend/recommend' });
        },
      });
      return;
    }
    if (id === 'delete') {
      wx.showModal({
        title: '注销账号',
        content: '注销将删除你的全部资料（含相册与语音故事），不可恢复。确定继续吗？',
        confirmText: '仍要注销',
        confirmColor: '#FF5A5F',
        success: async (r) => {
          if (!r.confirm) return;
          const res = await callFunction('deleteAccount');
          clearLogin();
          if (res && res.deleted) {
            wx.showToast({ title: '已注销', icon: 'success' });
          } else {
            // 云端删除失败也先退出登录；下次登录会重建账号
            wx.showToast({ title: '已退出（注销未完成，可重试）', icon: 'none' });
          }
          wx.reLaunch({ url: '/pages/recommend/recommend' });
        },
      });
    }
  },
});
