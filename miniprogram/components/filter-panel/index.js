// components/filter-panel/index.js —— 遇见列表筛选面板（纯 UI，状态自持）
// TDesign 化（2026-08-19）：多选 t-check-tag、已选城市 t-tag closable、区间与省市走共享
// t-picker 弹层（复刻 profile-edit 的 pickerVisible + 动态 options 模式）。
// 选中态在 JS 侧预计算 chipGroups（WXML 表达式不支持方法调用）；
// 「应用」时 triggerEvent('change', { filter })，重置时 emit { filter: {} }。
const { EDUCATIONS, EMOTIONAL_STATUS, JOBS } = require('../../utils/options.js');
const { PROVINCES, CITY_MAP } = require('../../utils/region-data.js');

const UNLIMITED = '不限';
// t-picker-item 选项：{label, value}
const AGE_OPTIONS = Array.from({ length: 53 }, (_, i) => ({ label: 18 + i + '岁', value: 18 + i })); // 18-70
const HEIGHT_OPTIONS = Array.from({ length: 36 }, (_, i) => ({ label: 140 + i * 2 + 'cm', value: 140 + i * 2 })); // 140-210 步进 2
// 共享单列 t-picker 的区间字段配置（field → 标题/选项/写回 data 键）
const RANGE_DEFS = {
  ageMin: { title: '年龄下限', options: AGE_OPTIONS, key: 'selAgeMin' },
  ageMax: { title: '年龄上限', options: AGE_OPTIONS, key: 'selAgeMax' },
  heightMin: { title: '身高下限', options: HEIGHT_OPTIONS, key: 'selHeightMin' },
  heightMax: { title: '身高上限', options: HEIGHT_OPTIONS, key: 'selHeightMax' },
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
    provinces: PROVINCES, // t-picker-item 直接吃 {label, value}
    selAgeMin: UNLIMITED, selAgeMax: UNLIMITED,
    selHeightMin: UNLIMITED, selHeightMax: UNLIMITED,
    selEducations: [], selEmotionalStatuses: [], selJobs: [], selCities: [],
    chipGroups: [],
    // 共享单列 t-picker（区间四路，RANGE_DEFS 驱动）
    pickerVisible: false, pickerField: '', pickerTitle: '', pickerOptions: [], pickerValue: [],
    // 省市双列联动 t-picker
    regionVisible: false, regionCities: [], regionValue: [],
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

    // 多选 chips（t-check-tag；dataset 携带 group/item，同 tags-edit 模式）
    onToggleSelect(e) {
      const { group, item } = e.currentTarget.dataset; // group 为 data 键名
      const list = this.data[group].slice();
      const idx = list.indexOf(item);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(item);
      this.setData({ [group]: list });
      this.refreshChips();
    },

    // 区间触发行 → 打开共享 t-picker（当前值回显，未选过则空）
    onTapRange(e) {
      const { field } = e.currentTarget.dataset;
      const def = RANGE_DEFS[field];
      if (!def) return;
      const cur = this.data[def.key];
      this.setData({
        pickerVisible: true, pickerField: field, pickerTitle: def.title,
        pickerOptions: def.options,
        pickerValue: cur === UNLIMITED ? [] : [cur],
      });
    },
    onRangeConfirm(e) {
      const value = (e.detail && e.detail.value) || [];
      if (value.length > 0 && this.data.pickerField) {
        this.setData({ [RANGE_DEFS[this.data.pickerField].key]: value[0] });
      }
      this.setData({ pickerVisible: false });
    },
    onRangeCancel() {
      this.setData({ pickerVisible: false });
    },
    onPickerVisibleChange(e) {
      // 遮罩/外部关闭时同步状态，避免残留 visible=true
      this.setData({ pickerVisible: !!(e.detail && e.detail.visible) });
    },

    // 省市双列联动（同 profile-edit region 模式）：确认后 '省 市' 追加进已选
    onRegionOpen() {
      this.setData({
        regionCities: CITY_MAP[PROVINCES[0].value] || [],
        regionValue: [],
        regionVisible: true,
      });
    },
    onRegionPick(e) {
      if ((e.detail || {}).column !== 0) return; // 第一列（省）滚动：刷新第二列城市
      const province = e.detail.value[0];
      this.setData({ regionCities: CITY_MAP[province] || [] });
    },
    onRegionConfirm(e) {
      const [province, city] = (e.detail && e.detail.value) || [];
      if (province && city) {
        const item = province + ' ' + city; // 与 profiles.about.city 存储格式一致
        if (this.data.selCities.indexOf(item) < 0) {
          this.setData({ selCities: this.data.selCities.concat(item) });
        }
      }
      this.setData({ regionVisible: false });
    },
    onRegionCancel() {
      this.setData({ regionVisible: false });
    },
    onRegionVisibleChange(e) {
      this.setData({ regionVisible: !!(e.detail && e.detail.visible) });
    },

    // 已选城市 chip 的 ×（t-tag closable）
    onRemoveCity(e) {
      const { item } = e.currentTarget.dataset;
      const list = this.data.selCities.slice();
      const idx = list.indexOf(item);
      if (idx >= 0) list.splice(idx, 1);
      this.setData({ selCities: list });
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
        pickerVisible: false, regionVisible: false,
      });
      this.refreshChips();
      this.triggerEvent('change', { filter: {} });
    },
  },
});
