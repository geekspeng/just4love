// pages/interaction-list/interaction-list.js —— 谁看过我（type=view）/ 喜欢我的（type=like）
const { callFunction } = require('../../utils/request.js');

Page({
  data: {
    type: 'view',
    title: '谁看过我',
    list: [],
    loading: false,
  },

  onLoad(options) {
    const type = (options && options.type) === 'like' ? 'like' : 'view';
    wx.setNavigationBarTitle({ title: type === 'like' ? '喜欢我的' : '谁看过我' });
    this.setData({ type, title: type === 'like' ? '喜欢我的' : '谁看过我' });
    this.loadList(type);
  },

  async loadList(type) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    const res = await callFunction('getInteractions', { type });
    this.setData({ loading: false });
    if (!res || res.error) {
      wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' });
      return;
    }
    this.setData({ list: res.list || [] });
  },

  onTapItem(e) {
    const { id } = e.currentTarget.dataset;
    if (id) wx.navigateTo({ url: '/pages/profile-detail/profile-detail?id=' + id, fail: () => {} });
  },
});
