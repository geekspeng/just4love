// pages/album-edit/album-edit.js —— 5 分类照片：选图→上传云存储→即时保存
// slots 为按 5 个分类预排的展示槽位（含空槽），WXML 不做查找逻辑。
const { callFunction } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { uploadImage } = require('../../utils/upload.js');
const { ALBUM_CATEGORIES } = require('../../utils/options.js');

Page({
  data: {
    album: [],   // [{category, fileID}]
    slots: [],   // [{category, fileID:''}]
    userId: '',
  },

  async onLoad() {
    const user = await ensureLogin();
    this.setData({ userId: (user && user.userId) || '' });
    const res = await callFunction('getMyProfile');
    const album = (res && res.profile && res.profile.album) || [];
    this.setData({ album, slots: this.buildSlots(album) });
  },

  buildSlots(album) {
    return ALBUM_CATEGORIES.map((category) => {
      const hit = album.find((a) => a.category === category);
      return { category, fileID: hit ? hit.fileID : '' };
    });
  },

  updateAlbum(album) {
    this.setData({ album, slots: this.buildSlots(album) });
  },

  // 点空槽「上传」或「更换」：选图 → 上传 → 整段保存
  async onChoose(e) {
    const { category } = e.currentTarget.dataset;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (r) => {
        const tempPath = r.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中' });
        const fileID = await uploadImage('album/' + (this.data.userId || 'unknown'), tempPath);
        wx.hideLoading();
        if (!fileID) {
          wx.showToast({ title: '上传失败', icon: 'none' });
          return;
        }
        const album = this.data.album.filter((a) => a.category !== category);
        album.push({ category, fileID });
        this.updateAlbum(album);
        await this.persist(album);
      },
    });
  },

  onPreview(e) {
    const { category } = e.currentTarget.dataset;
    const item = this.data.album.find((a) => a.category === category);
    if (!item) return;
    wx.previewImage({ current: item.fileID, urls: this.data.album.map((a) => a.fileID) });
  },

  async onRemove(e) {
    const { category } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除照片',
      content: '确定删除「' + category + '」的照片吗？',
      success: async (r) => {
        if (!r.confirm) return;
        const album = this.data.album.filter((a) => a.category !== category);
        this.updateAlbum(album);
        await this.persist(album);
      },
    });
  },

  async persist(album) {
    const res = await callFunction('updateProfile', { patch: { album } });
    if (res && res.profile) {
      wx.showToast({ title: '已保存', icon: 'success' });
    } else {
      wx.showToast({ title: (res && res.error) || '保存失败', icon: 'none' });
    }
  },
});
