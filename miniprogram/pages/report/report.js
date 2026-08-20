// pages/report/report.js —— 举报表单（类型 + 描述 + 可选截图 ≤3，提交至 report 云函数）
const { callFunction } = require('../../utils/request.js');
const { REPORT_TYPES } = require('../../utils/options.js');
const { uploadImage } = require('../../utils/upload.js');

const SHOTS_MAX = 3;

Page({
  data: {
    targetId: '',
    types: REPORT_TYPES.map((t) => ({ text: t, on: false })),
    selectedType: '',
    description: '',
    shots: [],          // [{ local, fileID, uploading }]
    submitting: false,
    submitted: false,
  },

  onLoad(options) {
    this.setData({ targetId: (options && options.id) || '' });
  },

  onToggleType(e) {
    const { item } = e.currentTarget.dataset; // 单选：仅保留一项
    this.setData({
      selectedType: item,
      types: this.data.types.map((t) => ({ text: t.text, on: t.text === item })),
    });
  },

  onInputDesc(e) {
    this.setData({ description: e.detail.value });
  },

  // 选图并直传云存储（失败槽位剔除并 toast）
  async onAddShot() {
    if (this.data.shots.length >= SHOTS_MAX) {
      wx.showToast({ title: '最多 3 张截图', icon: 'none' });
      return;
    }
    const that = this;
    wx.chooseMedia({
      count: SHOTS_MAX - this.data.shots.length,
      mediaType: ['image'],
      success: (res) => {
        res.tempFiles.forEach((f) => that.uploadShot(f.tempFilePath));
      },
      fail: () => {},
    });
  },

  async uploadShot(local) {
    this.setData({ shots: this.data.shots.concat({ local, fileID: '', uploading: true }) });
    const fileID = await uploadImage('reports', local);
    // 按 local 定位（并发上传中其他槽位可能被删除/失败剔除，捕获索引会错位）
    const idx = this.data.shots.findIndex((s) => s.local === local);
    if (idx < 0) return; // 该槽位已被用户删除，丢弃结果
    const shots = this.data.shots.slice();
    if (!fileID) {
      shots.splice(idx, 1);
      wx.showToast({ title: '截图上传失败', icon: 'none' });
    } else {
      shots[idx] = { local, fileID, uploading: false };
    }
    this.setData({ shots });
  },

  onRemoveShot(e) {
    const { index } = e.currentTarget.dataset;
    const shots = this.data.shots.slice();
    shots.splice(Number(index), 1);
    this.setData({ shots });
  },

  onBack() {
    wx.navigateBack({ fail: () => {} });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.data.selectedType) {
      wx.showToast({ title: '请选择举报类型', icon: 'none' });
      return;
    }
    const desc = this.data.description.trim();
    if (!desc) {
      wx.showToast({ title: '请填写举报描述', icon: 'none' });
      return;
    }
    if (this.data.shots.some((s) => s.uploading)) {
      wx.showToast({ title: '截图上传中，请稍候', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    const res = await callFunction('report', {
      targetId: this.data.targetId,
      type: this.data.selectedType,
      description: desc,
      screenshotFileIDs: this.data.shots.map((s) => s.fileID),
    });
    this.setData({ submitting: false });
    if (!res || res.error) {
      wx.showToast({ title: '提交失败，请稍后再试', icon: 'none' });
      return;
    }
    this.setData({ submitted: true });
  },
});
