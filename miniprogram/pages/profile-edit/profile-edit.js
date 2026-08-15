// pages/profile-edit/profile-edit.js —— 资料编辑（基本资料 + 相亲信息 + 隐私字段）
// 相册/故事/标签在独立页面维护，本页草稿中的对应段随保存原样回传。
const { callFunction } = require('../../utils/request.js');
const { ensureLogin, bindPhoneWithCode } = require('../../utils/auth.js');
const { createEmptyProfile, validateProfileDraft } = require('../../utils/profile.js');
const { getConstellation } = require('../../utils/constellation.js');
const { uploadImage } = require('../../utils/upload.js');
const {
  LOVE_GOALS, EMOTIONAL_STATUS, FAMILY_BACKGROUND, HABITS, EDUCATIONS, JOBS,
} = require('../../utils/options.js');

const HEIGHT_RANGE = [];
for (let h = 140; h <= 210; h++) HEIGHT_RANGE.push(h);

Page({
  data: {
    draft: null,
    avatarPreview: '',
    saving: false,
    today: '',
    genders: ['男', '女'],
    loveGoals: LOVE_GOALS,
    emotionalStatus: EMOTIONAL_STATUS,
    familyBackground: FAMILY_BACKGROUND,
    habits: HABITS,
    educations: EDUCATIONS,
    jobs: JOBS,
    heightRange: HEIGHT_RANGE,
    fbMap: {}, // 家庭背景选中态：{ '独生子女': true }（WXML 不能调 indexOf，用映射）
  },

  async onLoad() {
    const now = new Date();
    this.setData({
      today: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'),
    });
    const user = await ensureLogin();
    const res = await callFunction('getMyProfile');
    const profile = (res && res.profile) || createEmptyProfile(user);
    // 云端旧资料可能缺新字段，用空模板补齐结构
    const template = createEmptyProfile(user);
    const draft = { ...template, ...profile, basic: { ...template.basic, ...(profile.basic || {}) },
      about: { ...template.about, ...(profile.about || {}) },
      privacy: {
        asset: { ...template.privacy.asset, ...((profile.privacy || {}).asset || {}) },
        contact: { ...template.privacy.contact, ...((profile.privacy || {}).contact || {}) },
      },
      tags: { ...template.tags, ...(profile.tags || {}) } };
    this.setData({
      draft,
      avatarPreview: draft.basic.avatarFileID || '',
      fbMap: this.buildFbMap(draft.about.familyBackground),
    });
  },

  buildFbMap(list) {
    const map = {};
    (list || []).forEach((x) => { map[x] = true; });
    return map;
  },

  // 头像：chooseAvatar 得到本地临时路径，保存时才上传
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail || {};
    if (!avatarUrl) return;
    this._pendingAvatarPath = avatarUrl;
    this.setData({ avatarPreview: avatarUrl });
  },

  // 通用输入：data-path 如 "basic.nickname"
  onInput(e) {
    const { path } = e.currentTarget.dataset;
    this.setData({ ['draft.' + path]: e.detail.value });
  },

  onPickGender(e) {
    this.setData({ 'draft.basic.gender': this.data.genders[Number(e.detail.value)] });
  },

  onPickBirthday(e) {
    const birthday = e.detail.value;
    this.setData({
      'draft.basic.birthday': birthday,
      'draft.basic.constellation': getConstellation(birthday),
    });
  },

  // 通用单选 picker：data-field 如 "about.loveGoal"，data-options 如 "loveGoals"
  onPickOption(e) {
    const { field, options: optionsKey } = e.currentTarget.dataset;
    const value = this.data[optionsKey][Number(e.detail.value)];
    this.setData({ ['draft.' + field]: value });
  },

  onPickHeight(e) {
    this.setData({ 'draft.about.height': HEIGHT_RANGE[Number(e.detail.value)] });
  },

  // 省市选择（region picker 返回 [省, 市, 区]，只取省市）
  onRegion(e) {
    const { field } = e.currentTarget.dataset;
    const [province, city] = e.detail.value;
    this.setData({ ['draft.' + field]: province + ' ' + city });
  },

  onToggleFamily(e) {
    const { item } = e.currentTarget.dataset;
    const list = (this.data.draft.about.familyBackground || []).slice();
    const idx = list.indexOf(item);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(item);
    }
    this.setData({ 'draft.about.familyBackground': list, fbMap: this.buildFbMap(list) });
  },

  // 吸烟/喝酒/打牌：data-field="about.smoke" 等
  onPickHabit(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ ['draft.' + field]: HABITS[Number(e.detail.value)] });
  },

  // getPhoneNumber 按钮：code → 云函数解码 → 回填
  async onGetPhone(e) {
    const { code } = e.detail || {};
    if (!code) return;
    const res = await bindPhoneWithCode(code);
    if (res && res.phone) {
      this.setData({ 'draft.privacy.contact.phone': res.phone });
      wx.showToast({ title: '已获取手机号', icon: 'success' });
    } else {
      wx.showToast({ title: '获取手机号失败', icon: 'none' });
    }
  },

  async onSave() {
    if (this.data.saving || !this.data.draft) return;
    const check = validateProfileDraft(this.data.draft);
    if (!check.ok) {
      wx.showToast({ title: check.message, icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      const patch = {};
      ['basic', 'about', 'privacy', 'album', 'stories', 'tags'].forEach((k) => {
        patch[k] = this.data.draft[k];
      });
      // 待上传头像：先传云存储
      if (this._pendingAvatarPath) {
        const fileID = await uploadImage(
          'avatars/' + (this.data.draft.userId || 'unknown'),
          this._pendingAvatarPath
        );
        if (!fileID) {
          wx.showToast({ title: '头像上传失败，请重试', icon: 'none' });
          return;
        }
        patch.basic = { ...patch.basic, avatarFileID: fileID };
      }
      const res = await callFunction('updateProfile', { patch });
      if (res && res.profile) {
        this._pendingAvatarPath = null;
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack({ fail: () => {} }), 600);
      } else {
        wx.showToast({ title: (res && res.error) || '保存失败', icon: 'none' });
      }
    } finally {
      this.setData({ saving: false });
    }
  },
});
