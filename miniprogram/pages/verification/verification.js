// pages/verification/verification.js —— 我的认证（身份/学历/职业三类，材料图直传云存储）
// 状态机见 submitVerification：pending/approved 不可重复提交；rejected 可重新提交（重新选图）。
// 任一类通过即升级认证嘉宾（每日查看数 5→15），审核在管理后台进行。
const { callFunction } = require('../../utils/request.js');
const { uploadImage } = require('../../utils/upload.js');

const TYPE_TEXT = { identity: '身份认证', education: '学历认证', career: '职业认证' };
const STATUS = {
  none: { text: '未提交', theme: 'default' },
  pending: { text: '审核中', theme: 'warning' },
  approved: { text: '已认证', theme: 'success' },
  rejected: { text: '已驳回', theme: 'danger' },
};
const SHOTS_MAX = 3;

Page({
  data: {
    items: [],    // [{ type, typeText, statusText, statusTheme, editable, materials, shots, submitting }]
    loading: false,
  },

  onShow() {
    this.loadList();
  },

  async loadList() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    const res = await callFunction('getMyVerifications');
    this.setData({ loading: false });
    if (!res || res.error) {
      wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' });
      return;
    }
    this.setData({
      items: (res.list || []).map((v) => ({
        type: v.type,
        typeText: TYPE_TEXT[v.type] || v.type,
        status: v.status,
        statusText: (STATUS[v.status] || STATUS.none).text,
        statusTheme: (STATUS[v.status] || STATUS.none).theme,
        editable: v.status === 'none' || v.status === 'rejected',
        materials: v.materialFileIDs || [], // 已提交材料（云端 fileID，只读展示）
        shots: [],                          // 本次编辑新选的图 [{ local, fileID, uploading }]
        submitting: false,
      })),
    });
  },

  // 选图并直传云存储（与 report 页同款：按 local 定位防索引竞态）
  onAddShot(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const item = this.data.items[idx];
    if (!item || !item.editable) return;
    if (item.shots.length >= SHOTS_MAX) {
      wx.showToast({ title: '最多 3 张材料', icon: 'none' });
      return;
    }
    const that = this;
    wx.chooseMedia({
      count: SHOTS_MAX - item.shots.length,
      mediaType: ['image'],
      success: (res) => {
        res.tempFiles.forEach((f) => that.uploadShot(idx, f.tempFilePath));
      },
      fail: () => {},
    });
  },

  async uploadShot(idx, local) {
    this.setData({ ['items[' + idx + '].shots']: this.data.items[idx].shots.concat({ local, fileID: '', uploading: true }) });
    const fileID = await uploadImage('verifications', local);
    const shots = this.data.items[idx].shots;
    const slot = shots.findIndex((s) => s.local === local);
    if (slot < 0) return; // 槽位已被删除，丢弃结果
    const next = shots.slice();
    if (!fileID) {
      next.splice(slot, 1);
      wx.showToast({ title: '材料上传失败', icon: 'none' });
    } else {
      next[slot] = { local, fileID, uploading: false };
    }
    this.setData({ ['items[' + idx + '].shots']: next });
  },

  onRemoveShot(e) {
    const { idx, local } = e.currentTarget.dataset;
    const item = this.data.items[Number(idx)];
    if (!item) return;
    this.setData({
      ['items[' + idx + '].shots']: item.shots.filter((s) => s.local !== local),
    });
  },

  async onSubmit(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const item = this.data.items[idx];
    if (!item || item.submitting) return;
    if (item.shots.some((s) => s.uploading)) {
      wx.showToast({ title: '材料上传中，请稍候', icon: 'none' });
      return;
    }
    const fileIDs = item.shots.map((s) => s.fileID);
    if (!fileIDs.length) {
      wx.showToast({ title: '请先上传证明材料', icon: 'none' });
      return;
    }
    this.setData({ ['items[' + idx + '].submitting']: true });
    const res = await callFunction('submitVerification', { type: item.type, materialFileIDs: fileIDs });
    this.setData({ ['items[' + idx + '].submitting']: false });
    if (!res || res.error) {
      wx.showToast({ title: (res && res.error === 'invalid materials') ? '材料需为 1-3 张图片' : '提交失败，请稍后再试', icon: 'none' });
      return;
    }
    wx.showToast({ title: res.unchanged ? '该认证已在审核中' : '已提交，等待审核', icon: 'none' });
    this.loadList();
  },

  // 已提交材料点开大图
  onPreview(e) {
    const { url, urls } = e.currentTarget.dataset;
    wx.previewImage({ urls, current: url, fail: () => {} });
  },
});
