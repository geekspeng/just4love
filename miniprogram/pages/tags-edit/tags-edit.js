// pages/tags-edit/tags-edit.js —— 4 类标签预设池多选（每类 ≤5）
const { callFunction } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { TAG_POOLS, LIMITS } = require('../../utils/options.js');

const POOL_TITLES = {
  hobby: '爱好', personality: '性格', food: '喜欢的食物', media: '喜欢的影视',
};

Page({
  data: {
    pools: [],   // [{key, title, items: [{name, selected}]}]
    saving: false,
  },

  async onLoad() {
    await ensureLogin();
    const res = await callFunction('getMyProfile');
    const selected = (res && res.profile && res.profile.tags) || {};
    this.setData({ pools: this.buildPools(selected) });
  },

  buildPools(selected) {
    return Object.keys(TAG_POOLS).map((key) => ({
      key,
      title: POOL_TITLES[key],
      items: TAG_POOLS[key].map((name) => ({
        name,
        selected: ((selected[key] || []).indexOf(name) >= 0),
      })),
    }));
  },

  onToggle(e) {
    const { group, name } = e.currentTarget.dataset;
    const gi = this.data.pools.findIndex((p) => p.key === group);
    const pool = this.data.pools[gi];
    const item = pool.items.find((it) => it.name === name);
    if (!item.selected) {
      const count = pool.items.filter((it) => it.selected).length;
      if (count >= LIMITS.TAGS_PER_CATEGORY_MAX) {
        wx.showToast({ title: '每类最多选 ' + LIMITS.TAGS_PER_CATEGORY_MAX + ' 个', icon: 'none' });
        return;
      }
    }
    const ii = pool.items.indexOf(item);
    this.setData({ ['pools[' + gi + '].items[' + ii + '].selected']: !item.selected });
  },

  async onSave() {
    if (this.data.saving) return;
    const tags = {};
    this.data.pools.forEach((p) => {
      tags[p.key] = p.items.filter((it) => it.selected).map((it) => it.name);
    });
    this.setData({ saving: true });
    const res = await callFunction('updateProfile', { patch: { tags } });
    this.setData({ saving: false });
    if (res && res.profile) {
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack({ fail: () => {} }), 600);
    } else {
      wx.showToast({ title: (res && res.error) || '保存失败', icon: 'none' });
    }
  },
});
