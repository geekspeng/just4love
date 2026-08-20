// pages/message/message.js —— 【消息】tab：系统通知流（心动/被查看/匹配/授权请求与结果）
// 未读红点 + 点击已读 + tabBar 角标；consent_request 行内同意/拒绝；顶部入口进谁看过我/喜欢我的。
const { callFunction } = require('../../utils/request.js');

// 通知类型 → 展示文案（payload 为写入时快照；name 兜底嘉宾编号）
function entryText(n) {
  const name = (n.payload && (n.payload.nickname || n.payload.guestNo)) || '一位嘉宾';
  switch (n.type) {
    case 'like': return name + ' 对你心动了';
    case 'view': return name + ' 查看了你的资料';
    case 'match': return '与 ' + name + ' 匹配成功！可申请查看联系方式';
    case 'consent_request': return name + ' 申请查看你的' + (n.payload.field === 'asset' ? '资产信息' : '联系方式');
    case 'consent_result': {
      const field = n.payload.field === 'asset' ? '资产信息' : '联系方式';
      const map = { approved: '已同意，对方现在可查看', rejected: '已拒绝', revoked: '已撤销' };
      return '你的' + field + '申请：' + (map[n.payload.status] || '已更新');
    }
    default: return '收到一条新消息';
  }
}

Page({
  data: {
    entries: [], // [{ _id, type, payload, read, createdAt, text }]
    unread: 0,
    loading: false,
  },

  onShow() {
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  async loadList() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    const res = await callFunction('getNotifications');
    this.setData({ loading: false });
    if (!res || res.error) return; // 失败静默，保留下次 onShow 重试
    this.setData({
      entries: (res.list || []).map((n) => Object.assign({}, n, { text: entryText(n) })),
      unread: res.unread || 0,
    });
    this.syncBadge(res.unread || 0);
  },

  // tabBar 消息 tab（index 1）未读角标
  syncBadge(unread) {
    if (unread > 0) {
      wx.setTabBarBadge({ index: 1, text: String(Math.min(unread, 99)), fail: () => {} });
    } else {
      wx.removeTabBarBadge({ index: 1, fail: () => {} });
    }
  },

  // 点击行：已读 + 按类型跳转（心动/匹配/授权 → 对方详情）
  async onTapEntry(e) {
    const { id, profileId, read } = e.currentTarget.dataset;
    if (!read) {
      await callFunction('markRead', { ids: [id] });
      this.setData({
        unread: Math.max(0, this.data.unread - 1),
        entries: this.data.entries.map((n) => (n._id === id ? Object.assign({}, n, { read: true }) : n)),
      });
      this.syncBadge(Math.max(0, this.data.unread - 1));
    }
    if (profileId && profileId !== 'null') {
      wx.navigateTo({ url: '/pages/profile-detail/profile-detail?id=' + profileId, fail: () => {} });
    }
  },

  // consent_request 行内处理：approve / reject
  async onRespond(e) {
    const { consentId, action } = e.currentTarget.dataset;
    const res = await callFunction('respondConsent', { consentId, action });
    if (!res || res.error) {
      wx.showToast({ title: '操作失败，请稍后再试', icon: 'none' });
      return;
    }
    wx.showToast({ title: action === 'approve' ? '已同意' : '已拒绝', icon: 'none' });
    this.loadList();
  },

  onOpenInteractions(e) {
    const { type } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/interaction-list/interaction-list?type=' + type });
  },
});
