// tests/unit/filter-panel.test.js —— filter-panel 组件单测（逻辑级）
// TDesign 化（2026-08-19）：子组件（t-check-tag/t-picker 等）的视觉与弹层交互不进 simulate
// 断言（渲染由 e2e 覆盖，见 p2-meet「筛选面板渲染 TDesign 组件」）；此处直驱实例方法
// + data 断言，验证选择状态机与对外契约。
const simulate = require('miniprogram-simulate');
const path = require('path');

let id;

beforeAll(() => {
  id = simulate.load(path.resolve(__dirname, '../../miniprogram/components/filter-panel/index'));
});

function render() {
  const comp = simulate.render(id, {});
  comp.attach(document.createElement('parent-wrapper'));
  return comp;
}

describe('components/filter-panel', () => {
  test('默认收起；onToggle 展开/收起', () => {
    const comp = render();
    expect(comp.data.expanded).toBe(false);
    comp.instance.onToggle();
    expect(comp.data.expanded).toBe(true);
    comp.instance.onToggle();
    expect(comp.data.expanded).toBe(false);
    comp.detach();
  });

  test('chipGroups 覆盖三组维度（学历 5 / 婚姻 3 / 职业 11）', () => {
    const comp = render();
    expect(comp.data.chipGroups.map((g) => g.title)).toEqual(['学历', '婚姻状况', '职业']);
    expect(comp.data.chipGroups[0].items).toHaveLength(5);
    expect(comp.data.chipGroups[1].items).toHaveLength(3);
    expect(comp.data.chipGroups[2].items).toHaveLength(11);
    comp.detach();
  });

  test('onToggleSelect 切换多选并同步 chipGroups 选中态', () => {
    const comp = render();
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selEducations', item: '本科' } } });
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selEducations', item: '硕士' } } });
    expect(comp.data.selEducations).toEqual(['本科', '硕士']);
    const edu = comp.data.chipGroups.find((g) => g.title === '学历');
    expect(edu.items.find((i) => i.text === '本科').on).toBe(true);
    expect(edu.items.find((i) => i.text === '大专').on).toBe(false);
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selEducations', item: '本科' } } });
    expect(comp.data.selEducations).toEqual(['硕士']);
    comp.detach();
  });

  test('区间：onTapRange 打开共享 t-picker，onRangeConfirm 写回对应字段', () => {
    const comp = render();
    comp.instance.onTapRange({ currentTarget: { dataset: { field: 'ageMin' } } });
    expect(comp.data.pickerVisible).toBe(true);
    expect(comp.data.pickerTitle).toBe('年龄下限');
    expect(comp.data.pickerOptions).toHaveLength(53); // 18-70 岁
    expect(comp.data.pickerValue).toEqual([]); // 未选过 → 空
    comp.instance.onRangeConfirm({ detail: { value: [25] } });
    expect(comp.data.pickerVisible).toBe(false);
    expect(comp.data.selAgeMin).toBe(25);

    // 已选过 → 回显当前值
    comp.instance.onTapRange({ currentTarget: { dataset: { field: 'ageMin' } } });
    expect(comp.data.pickerValue).toEqual([25]);

    comp.instance.onTapRange({ currentTarget: { dataset: { field: 'heightMax' } } });
    expect(comp.data.pickerTitle).toBe('身高上限');
    expect(comp.data.pickerOptions).toHaveLength(36); // 140-210 步进 2
    comp.instance.onRangeConfirm({ detail: { value: [178] } });
    expect(comp.data.selHeightMax).toBe(178);

    // 取消不写值
    comp.instance.onTapRange({ currentTarget: { dataset: { field: 'ageMax' } } });
    comp.instance.onRangeCancel();
    expect(comp.data.pickerVisible).toBe(false);
    expect(comp.data.selAgeMax).toBe('不限');
    comp.detach();
  });

  test('省市：onRegionOpen 载入首省城市，onRegionPick 联动刷新，onRegionConfirm 去重追加，onRemoveCity 删除', () => {
    const comp = render();
    comp.instance.onRegionOpen();
    expect(comp.data.regionVisible).toBe(true);
    expect(comp.data.regionCities.map((c) => c.label)).toContain('东城区'); // 首省=北京市
    comp.instance.onRegionPick({ detail: { column: 0, value: ['广东省'] } });
    expect(comp.data.regionCities.map((c) => c.label)).toContain('深圳市');
    comp.instance.onRegionPick({ detail: { column: 1, value: ['广东省', '深圳市'] } }); // 市列滚动不刷新
    comp.instance.onRegionConfirm({ detail: { value: ['广东省', '深圳市'] } });
    expect(comp.data.selCities).toEqual(['广东省 深圳市']);
    expect(comp.data.regionVisible).toBe(false);
    comp.instance.onRegionConfirm({ detail: { value: ['广东省', '深圳市'] } }); // 重复不加
    expect(comp.data.selCities).toEqual(['广东省 深圳市']);
    comp.instance.onRemoveCity({ currentTarget: { dataset: { item: '广东省 深圳市' } } });
    expect(comp.data.selCities).toEqual([]);
    comp.detach();
  });

  test('应用：emit change 携带完整 filter（只含已选维度，数值为 number）', () => {
    const comp = render();
    const spy = jest.fn();
    comp.instance.triggerEvent = spy;
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selJobs', item: '金融' } } });
    comp.instance.onTapRange({ currentTarget: { dataset: { field: 'ageMin' } } });
    comp.instance.onRangeConfirm({ detail: { value: [25] } });
    comp.instance.onApply();
    expect(spy).toHaveBeenCalledWith('change', { filter: { ageMin: 25, jobs: ['金融'] } });
    comp.detach();
  });

  test('重置：清空全部选择并 emit 空 filter', () => {
    const comp = render();
    const spy = jest.fn();
    comp.instance.triggerEvent = spy;
    comp.instance.onTapRange({ currentTarget: { dataset: { field: 'ageMin' } } });
    comp.instance.onRangeConfirm({ detail: { value: [25] } }); // 先写入再验证清空
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selCities', item: '广东省 深圳市' } } });
    comp.instance.onReset();
    expect(comp.data.selAgeMin).toBe('不限');
    expect(comp.data.selCities).toEqual([]);
    expect(comp.data.pickerVisible).toBe(false);
    expect(comp.data.regionVisible).toBe(false);
    expect(spy).toHaveBeenCalledWith('change', { filter: {} });
    comp.detach();
  });
});
