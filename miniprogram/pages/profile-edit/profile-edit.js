// pages/profile-edit/profile-edit.js —— 资料编辑（基本资料 + 相亲信息 + 隐私字段）
// 相册/故事/标签在独立页面维护，本页草稿中的对应段随保存原样回传。
// 单列选择字段统一走共享 t-picker（PICKER_DEFS 配置驱动）；生日用 t-date-time-picker；
// 现居地/家乡走双列联动 t-picker（region-data，第一列 pick 时刷新第二列）。
const { callFunction } = require('../../utils/request.js');
const { ensureLogin, bindPhoneWithCode } = require('../../utils/auth.js');
const { createEmptyProfile, validateProfileDraft } = require('../../utils/profile.js');
const { getConstellation } = require('../../utils/constellation.js');
const { uploadImage } = require('../../utils/upload.js');
const {
  LOVE_GOALS, EMOTIONAL_STATUS, FAMILY_BACKGROUND, HABITS, EDUCATIONS, JOBS,
  HOUSE, CAR, INCOME,
} = require('../../utils/options.js');
const { PROVINCES, CITY_MAP } = require('../../utils/region-data.js');

// ['男','女'] → [{label:'男', value:'男'}]（值为文案，选中即入库）
function textOptions(list) {
  return list.map((x) => ({ label: x, value: x }));
}

// 140..210 → [{label:'140cm', value:140}]（数字入库）
function rangeOptions(min, max, unit) {
  const arr = [];
  for (let n = min; n <= max; n++) arr.push({ label: n + unit, value: n });
  return arr;
}

// 共享 t-picker 的字段配置：data-field 即 draft 路径
const PICKER_DEFS = {
  'basic.gender': { title: '性别', options: textOptions(['男', '女']) },
  'about.loveGoal': { title: '恋爱目标', options: textOptions(LOVE_GOALS) },
  'about.emotionalStatus': { title: '情感状态', options: textOptions(EMOTIONAL_STATUS) },
  'about.height': { title: '身高', options: rangeOptions(140, 210, 'cm') },
  'about.weight': { title: '体重', options: rangeOptions(35, 150, 'kg') },
  'about.education': { title: '学历', options: textOptions(EDUCATIONS) },
  'about.job': { title: '职业', options: textOptions(JOBS) },
  'about.smoke': { title: '吸烟', options: textOptions(HABITS) },
  'about.drink': { title: '喝酒', options: textOptions(HABITS) },
  'about.gamble': { title: '打牌', options: textOptions(HABITS) },
  'privacy.asset.house': { title: '房产', options: textOptions(HOUSE) },
  'privacy.asset.car': { title: '车辆', options: textOptions(CAR) },
  'privacy.asset.income': { title: '收入', options: textOptions(INCOME) },
};

// basicInit 后不可改的字段（生日在独立日期组件的打开入口守卫）
const LOCKED_FIELDS = ['basic.gender'];

// 'privacy.asset.house' → 取 draft 里对应的当前值
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// '广东省 深圳市' → ['广东省', '深圳市']（旧自由文本不匹配时返回空数组）
function parseRegion(text) {
  if (typeof text !== 'string' || text.indexOf(' ') < 0) return [];
  const parts = text.split(' ');
  return CITY_MAP[parts[0]] ? parts.slice(0, 2) : [];
}

Page({
  data: {
    draft: null,
    avatarPreview: '',
    saving: false,
    today: '',
    familyBackground: FAMILY_BACKGROUND,
    fbMap: {}, // 家庭背景选中态：{ '独生子女': true }（WXML 不能调 indexOf，用映射）
    // 共享 t-picker 状态
    pickerVisible: false,
    pickerField: '',
    pickerTitle: '',
    pickerOptions: [],
    pickerValue: [],
    // 生日 t-date-time-picker
    birthdayVisible: false,
    // 现居地/家乡双列联动 t-picker
    regionVisible: false,
    regionField: '',
    regionTitle: '',
    regionProvinces: PROVINCES,
    regionCities: [],
    regionValue: [],
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

  // 打开共享 t-picker：data-field 如 "privacy.asset.house"（见 PICKER_DEFS）
  onOpenPicker(e) {
    const { field } = e.currentTarget.dataset;
    if (!this.data.draft) return;
    if (this.data.draft.basicInit && LOCKED_FIELDS.indexOf(field) >= 0) return;
    const def = PICKER_DEFS[field];
    if (!def) return;
    const current = getPath(this.data.draft, field);
    this.setData({
      pickerField: field,
      pickerTitle: def.title,
      pickerOptions: def.options,
      // 当前值不在选项里（如旧的自由文本）时不预选，从第一项开始
      pickerValue: current ? [current] : [],
      pickerVisible: true,
    });
  },

  onPickerConfirm(e) {
    const value = (e.detail.value || [])[0];
    this.setData({ ['draft.' + this.data.pickerField]: value, pickerVisible: false });
  },

  onPickerCancel() {
    this.setData({ pickerVisible: false });
  },

  // 遮罩/外部关闭（autoClose）时同步页面状态，避免残留 visible=true
  onPickerVisibleChange(e) {
    this.setData({ pickerVisible: !!(e.detail && e.detail.visible) });
  },

  onOpenBirthday() {
    if (this.data.draft && this.data.draft.basicInit) return;
    this.setData({ birthdayVisible: true });
  },

  onBirthdayConfirm(e) {
    const birthday = e.detail.value;
    this.setData({
      'draft.basic.birthday': birthday,
      'draft.basic.constellation': getConstellation(birthday),
      birthdayVisible: false,
    });
  },

  onBirthdayCancel() {
    this.setData({ birthdayVisible: false });
  },

  // 现居地/家乡：打开双列联动 t-picker，data-field="about.city"/"about.hometown"
  onOpenRegion(e) {
    const { field } = e.currentTarget.dataset;
    if (!this.data.draft) return;
    const [province, city] = parseRegion(getPath(this.data.draft, field));
    this.setData({
      regionField: field,
      regionTitle: field === 'about.city' ? '现居地' : '家乡',
      regionCities: CITY_MAP[province] || CITY_MAP[PROVINCES[0].value],
      regionValue: province ? [province, city] : [],
      regionVisible: true,
    });
  },

  // 第一列（省）滚动：刷新第二列城市；市列旧值不匹配时组件自动落第一项
  onRegionPick(e) {
    if ((e.detail || {}).column !== 0) return;
    const province = e.detail.value[0];
    this.setData({ regionCities: CITY_MAP[province] || [] });
  },

  onRegionConfirm(e) {
    const [province, city] = e.detail.value || [];
    if (province && city) {
      this.setData({ ['draft.' + this.data.regionField]: province + ' ' + city });
    }
    this.setData({ regionVisible: false });
  },

  onRegionCancel() {
    this.setData({ regionVisible: false });
  },

  onRegionVisibleChange(e) {
    this.setData({ regionVisible: !!(e.detail && e.detail.visible) });
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
