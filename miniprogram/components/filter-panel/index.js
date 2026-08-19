// components/filter-panel/index.js —— 遇见列表筛选面板（纯 UI，状态自持）
// 选中态在 JS 侧预计算 chipGroups（WXML 表达式不支持方法调用）；
// 「应用」时 triggerEvent('change', { filter })，重置时 emit { filter: {} }。
const { EDUCATIONS, EMOTIONAL_STATUS, JOBS } = require('../../utils/options.js');
const { PROVINCES, CITY_MAP } = require('../../utils/region-data.js');

const UNLIMITED = '不限';
const RANGE_KEYS = {
  ageMin: 'selAgeMin', ageMax: 'selAgeMax',
  heightMin: 'selHeightMin', heightMax: 'selHeightMax',
};
// 多选组定义：data 键 → 选项池（顺序即渲染顺序）
const GROUP_DEFS = [
  { key: 'selEducations', title: '学历', pool: EDUCATIONS },
  { key: 'selEmotionalStatuses', title: '婚姻状况', pool: EMOTIONAL_STATUS },
  { key: 'selJobs', title: '职业', pool: JOBS },
];

Component({
  data: {
    expanded: false,
    provinces: PROVINCES.map((p) => p.label),
    ageOptions: Array.from({ length: 53 }, (_, i) => 18 + i), // 18-70 岁
    heightOptions: Array.from({ length: 36 }, (_, i) => 140 + i * 2), // 140-210cm 步进 2
    selAgeMin: UNLIMITED, selAgeMax: UNLIMITED,
    selHeightMin: UNLIMITED, selHeightMax: UNLIMITED,
    selEducations: [], selEmotionalStatuses: [], selJobs: [], selCities: [],
    selProvince: '', cityOptions: [],
    chipGroups: [],
  },

  lifetimes: {
    attached() {
      this.refreshChips();
    },
  },

  methods: {
    onToggle() {
      this.setData({ expanded: !this.data.expanded });
    },

    // 选中数组 → chipGroups 展示模型（on 态随选择变化重算）
    refreshChips() {
      const chipGroups = GROUP_DEFS.map((def) => ({
        key: def.key,
        title: def.title,
        items: def.pool.map((text) => ({ text, on: this.data[def.key].indexOf(text) >= 0 })),
      }));
      this.setData({ chipGroups });
    },

    onToggleSelect(e) {
      const { group, item } = e.currentTarget.dataset; // group 为 data 键名
      const list = this.data[group].slice();
      const idx = list.indexOf(item);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(item);
      this.setData({ [group]: list });
      this.refreshChips();
    },

    // 范围 picker（年龄/身高，最小/最大四路共用；e.detail.value 为选项下标）
    onRangeChange(e) {
      const { field } = e.currentTarget.dataset;
      const options = field.indexOf('height') === 0 ? this.data.heightOptions : this.data.ageOptions;
      const val = options[Number(e.detail.value)];
      this.setData({ [RANGE_KEYS[field]]: val });
    },

    onProvinceChange(e) {
      const prov = this.data.provinces[Number(e.detail.value)];
      this.setData({
        selProvince: prov,
        cityOptions: (CITY_MAP[prov] || []).map((c) => c.label),
      });
    },

    onCityChange(e) {
      const prov = this.data.selProvince;
      const city = this.data.cityOptions[Number(e.detail.value)];
      if (!prov || !city) return;
      const item = prov + ' ' + city; // 与 profiles.about.city 存储格式一致
      if (this.data.selCities.indexOf(item) < 0) {
        this.setData({ selCities: this.data.selCities.concat(item) });
      }
    },

    buildFilter() {
      const f = {};
      if (this.data.selAgeMin !== UNLIMITED) f.ageMin = this.data.selAgeMin;
      if (this.data.selAgeMax !== UNLIMITED) f.ageMax = this.data.selAgeMax;
      if (this.data.selHeightMin !== UNLIMITED) f.heightMin = this.data.selHeightMin;
      if (this.data.selHeightMax !== UNLIMITED) f.heightMax = this.data.selHeightMax;
      if (this.data.selEducations.length) f.educations = this.data.selEducations;
      if (this.data.selEmotionalStatuses.length) f.emotionalStatuses = this.data.selEmotionalStatuses;
      if (this.data.selJobs.length) f.jobs = this.data.selJobs;
      if (this.data.selCities.length) f.cities = this.data.selCities;
      return f;
    },

    onApply() {
      this.triggerEvent('change', { filter: this.buildFilter() });
    },

    onReset() {
      this.setData({
        selAgeMin: UNLIMITED, selAgeMax: UNLIMITED,
        selHeightMin: UNLIMITED, selHeightMax: UNLIMITED,
        selEducations: [], selEmotionalStatuses: [], selJobs: [], selCities: [],
        selProvince: '', cityOptions: [],
      });
      this.refreshChips();
      this.triggerEvent('change', { filter: {} });
    },
  },
});
