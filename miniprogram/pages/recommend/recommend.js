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

  async loadList(page, force) {
    // 防重入：普通调用（翻页/下拉）在途时直接跳过；
    // force=true（筛选变更）放行并发，用令牌作废旧请求的结果
    if (this.data.loading && !force) return page;
    const seq = (this._seq = (this._seq || 0) + 1);
    this.setData({ loading: true, loadError: false });
    const res = await callFunction('listProfiles', {
      filter: this.data.filter,
      page,
      pageSize: PAGE_SIZE,
    });
    if (seq !== this._seq) return page; // 已被更新的请求取代，结果丢弃
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

  // filter-panel 应用/重置：回到第 1 页重查（force 绕过在途防重入，令牌作废旧结果）
  onFilterChange(e) {
    this.setData({ filter: (e.detail && e.detail.filter) || {} });
    this.loadList(1, true);
  },

  // 卡片整体点击 → 详情（详情页负责配额/登录引导）
  onCardTap(e) {
    const p = e.detail.profile;
    if (p && p._id) {
      wx.navigateTo({ url: '/pages/profile-detail/profile-detail?id=' + p._id });
    }
  },
});
