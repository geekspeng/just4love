// pages/profile-preview/profile-preview.js —— 我的资料卡预览（他人视角）
const { callFunction } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { createEmptyProfile } = require('../../utils/profile.js');

Page({
  data: {
    profile: null,
    verified: false,
  },

  async onLoad() {
    const user = await ensureLogin();
    const res = await callFunction('getMyProfile');
    // 云调用失败时用空模板兜底（E2E 无后端也可渲染）
    this.setData({
      profile: (res && res.profile) || createEmptyProfile(user),
      verified: !!(user && user.role === 'verified'),
    });
  },
});
