// pages/group-qrcode/group-qrcode.js —— 加入交友群（群二维码仅认证用户可见，P4 运营功能）
// 二维码由管理后台上传更换（admin/saveGroupQr → config/groupQr）。
const { callFunction } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');

const VERIFIED_ROLES = ['verified', 'admin'];

Page({
  data: {
    verified: false,
    qrFileID: null, // null = 未配置或不可见
    loading: false,
  },

  async onShow() {
    const user = await ensureLogin();
    const verified = !!user && VERIFIED_ROLES.indexOf(user.role) >= 0;
    this.setData({ verified, qrFileID: null });
    if (!verified) return;
    this.setData({ loading: true });
    const res = await callFunction('getGroupQr');
    this.setData({ loading: false, qrFileID: (res && res.fileID) || null });
  },

  onPreviewQr() {
    if (!this.data.qrFileID) return;
    wx.previewImage({ urls: [this.data.qrFileID], fail: () => {} });
  },

  gotoVerify() {
    wx.navigateTo({ url: '/pages/verification/verification', fail: () => {} });
  },
});
