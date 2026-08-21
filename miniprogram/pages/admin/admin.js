// pages/admin/admin.js —— 管理后台（认证审核 / 举报处理 / 嘉宾管理 / 配置）
// 入口在 mine 菜单（role=admin 可见）；真正的权限防线是 admin 云函数的 role 守卫，
// 非管理员直链本页时首个 getConfig 返回 forbidden → 渲染「无权限」空态。
const { callFunction } = require('../../utils/request.js');
const { uploadImage } = require('../../utils/upload.js');

const TYPE_TEXT = { identity: '身份认证', education: '学历认证', career: '职业认证' };
const REPORT_STATUS = {
  pending: { text: '待处理', theme: 'warning' },
  resolved: { text: '已处置', theme: 'success' },
  ignored: { text: '已忽略', theme: 'default' },
};
const TABS = [
  { id: 'verifications', label: '认证审核' },
  { id: 'reports', label: '举报处理' },
  { id: 'guests', label: '嘉宾管理' },
  { id: 'config', label: '配置' },
];

Page({
  data: {
    forbidden: false,
    tabs: TABS,
    tab: 'verifications',
    verifications: [], // [{ _id, typeText, guestNo, nickname, status, materialFileIDs }]
    reports: [],       // [{ _id, type, description, screenshotFileIDs, status..., targetNickname, targetGuestNo }]
    guests: [],        // [{ profileId, guestNo, nickname, listed, forceHidden, role }]
    keyword: '',
    quotas: { normal: 5, verified: 15 },
    groupQrFileID: '',
    savingQuotas: false,
    uploadingQr: false,
    loading: false,
  },

  onLoad() {
    this.init();
  },

  async init() {
    const cfg = await callFunction('admin', { action: 'getConfig' });
    if (!cfg || cfg.error) {
      this.setData({ forbidden: true }); // forbidden / 云函数未部署，均给无权限空态
      return;
    }
    this.setData({
      quotas: cfg.quotas || { normal: 5, verified: 15 },
      groupQrFileID: cfg.groupQrFileID || '',
    });
    this.loadVerifications();
  },

  onTab(e) {
    const { tab } = e.currentTarget.dataset;
    if (tab === this.data.tab) return;
    this.setData({ tab });
    if (tab === 'verifications' && !this.data.verifications.length) this.loadVerifications();
    if (tab === 'reports' && !this.data.reports.length) this.loadReports();
    if (tab === 'guests' && !this.data.guests.length) this.loadGuests();
  },

  // ---- 认证审核 ----

  async loadVerifications() {
    this.setData({ loading: true });
    const res = await callFunction('admin', { action: 'listVerifications' });
    this.setData({ loading: false });
    if (!res || res.error) return;
    this.setData({
      verifications: (res.list || []).map((v) => Object.assign({}, v, {
        typeText: TYPE_TEXT[v.type] || v.type,
      })),
    });
  },

  async onReview(e) {
    const { id, decision } = e.currentTarget.dataset;
    const res = await callFunction('admin', { action: 'reviewVerification', verificationId: id, decision });
    if (!res || res.error) {
      wx.showToast({ title: (res && res.error === 'invalid state') ? '该申请已处理' : '操作失败', icon: 'none' });
      this.loadVerifications();
      return;
    }
    wx.showToast({ title: decision === 'approve' ? '已通过' : '已驳回', icon: 'none' });
    this.loadVerifications();
  },

  // ---- 举报处理 ----

  async loadReports() {
    this.setData({ loading: true });
    const res = await callFunction('admin', { action: 'listReports' });
    this.setData({ loading: false });
    if (!res || res.error) return;
    this.setData({
      reports: (res.list || []).map((r) => Object.assign({}, r, {
        statusText: (REPORT_STATUS[r.status] || REPORT_STATUS.pending).text,
        statusTheme: (REPORT_STATUS[r.status] || REPORT_STATUS.pending).theme,
      })),
    });
  },

  async onHandleReport(e) {
    const { id, handle } = e.currentTarget.dataset;
    if (handle === 'hide') {
      // 隐藏是重动作（对方资料从列表与直链消失），二次确认
      const that = this;
      wx.showModal({
        title: '强制隐藏资料',
        content: '隐藏后该嘉宾不再出现在遇见列表，直链也不可访问。确定吗？',
        confirmColor: '#FF5A5F',
        success: async (m) => {
          if (m.confirm) await that.doHandleReport(id, handle);
        },
      });
      return;
    }
    await this.doHandleReport(id, handle);
  },

  async doHandleReport(id, handle) {
    const res = await callFunction('admin', { action: 'handleReport', reportId: id, handle });
    if (!res || res.error) {
      wx.showToast({ title: (res && res.error === 'invalid state') ? '该举报已处理' : '操作失败', icon: 'none' });
      this.loadReports();
      return;
    }
    wx.showToast({ title: handle === 'hide' ? '已隐藏并结单' : '已忽略', icon: 'none' });
    this.loadReports();
  },

  // ---- 嘉宾管理 ----

  async loadGuests() {
    this.setData({ loading: true });
    const res = await callFunction('admin', { action: 'listGuests', keyword: this.data.keyword });
    this.setData({ loading: false });
    if (!res || res.error) return;
    this.setData({ guests: res.list || [] });
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onToggleFlag(e) {
    const { id, field } = e.currentTarget.dataset;
    const guest = this.data.guests.find((g) => g.profileId === id);
    if (!guest) return;
    const next = field === 'listed' ? !guest.listed : !guest.forceHidden;
    this.applyFlag(id, field, next);
  },

  async applyFlag(id, field, value) {
    const res = await callFunction('admin', {
      action: 'setProfileFlags', profileId: id, [field]: value,
    });
    if (!res || res.error) {
      wx.showToast({ title: '操作失败', icon: 'none' });
      return;
    }
    this.setData({
      guests: this.data.guests.map((g) => (g.profileId === id
        ? Object.assign({}, g, { listed: res.listed, forceHidden: res.forceHidden })
        : g)),
    });
    wx.showToast({ title: (field === 'listed' ? (value ? '已上架' : '已下架') : (value ? '已强制隐藏' : '已恢复展示')), icon: 'none' });
  },

  // ---- 配置（配额 + 群二维码） ----

  onQuotaInput(e) {
    const { key } = e.currentTarget.dataset;
    const n = Number(e.detail.value);
    this.setData({ ['quotas.' + key]: Number.isFinite(n) && n >= 0 ? n : 0 });
  },

  async onSaveQuotas() {
    if (this.data.savingQuotas) return;
    this.setData({ savingQuotas: true });
    const { normal, verified } = this.data.quotas;
    const res = await callFunction('admin', { action: 'saveQuotas', normal, verified });
    this.setData({ savingQuotas: false });
    if (!res || res.error) {
      wx.showToast({ title: '配额需为非负数字', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已保存，立即生效', icon: 'success' });
  },

  async onChooseQr() {
    if (this.data.uploadingQr) return;
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: async (res) => {
        const local = res.tempFiles[0].tempFilePath;
        that.setData({ uploadingQr: true });
        const fileID = await uploadImage('group-qrcode', local);
        that.setData({ uploadingQr: false });
        if (!fileID) {
          wx.showToast({ title: '图片上传失败', icon: 'none' });
          return;
        }
        const save = await callFunction('admin', { action: 'saveGroupQr', fileID });
        if (!save || save.error) {
          wx.showToast({ title: '保存失败', icon: 'none' });
          return;
        }
        that.setData({ groupQrFileID: fileID });
        wx.showToast({ title: '群二维码已更新', icon: 'success' });
      },
      fail: () => {},
    });
  },

  onPreviewQr() {
    if (!this.data.groupQrFileID) return;
    wx.previewImage({ urls: [this.data.groupQrFileID], fail: () => {} });
  },

  // 材料图 / 举报截图点开大图
  onPreview(e) {
    const { url, urls } = e.currentTarget.dataset;
    wx.previewImage({ urls, current: url, fail: () => {} });
  },
});
