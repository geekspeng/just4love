// pages/recommend/recommend.js —— 【遇见】tab：真实列表 + 筛选 + 分页（P2）
// 数据来自 listProfiles 云函数；卡片 VO 已脱敏（无隐私/身份字段）。
const { callFunction } = require('../../utils/request.js');

const PAGE_SIZE = 10;

Page({
  data: {
    list: [],
    page: 1,
    hasMore: false,
    loading: false,
    filter: {},
    loadError: false,
  },

  onLoad() {
    this.loadList(1);
  },

  onPullDownRefresh() {
    this.loadList(1).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return;
    this.loadList(this.data.page + 1);
  },

  async loadList(page) {
    if (this.data.loading) return this.data.page;
    this.setData({ loading: true, loadError: false });
    const res = await callFunction('listProfiles', {
      filter: this.data.filter,
      page,
      pageSize: PAGE_SIZE,
    });
    if (!res || res.error) {
      this.setData({ loading: false, loadError: true });
      return page;
    }
    this.setData({
      list: page === 1 ? res.list : this.data.list.concat(res.list),
      page: res.page,
      hasMore: res.hasMore,
      loading: false,
    });
    return res.page;
  },

  // filter-panel 应用/重置：回到第 1 页重查
  onFilterChange(e) {
    this.setData({ filter: (e.detail && e.detail.filter) || {} });
    this.loadList(1);
  },

  // 卡片整体点击 → 详情（详情页负责配额/登录引导）
  onCardTap(e) {
    const p = e.detail.profile;
    if (p && p._id) {
      wx.navigateTo({ url: '/pages/profile-detail/profile-detail?id=' + p._id });
    }
  },
});
