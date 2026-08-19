// tests/unit/filter-panel.test.js —— filter-panel 组件单测
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
  test('默认收起；点筛选条展开，再点收起', () => {
    const comp = render();
    expect(comp.data.expanded).toBe(false);
    comp.instance.onToggle();
    expect(comp.data.expanded).toBe(true);
    comp.instance.onToggle();
    expect(comp.data.expanded).toBe(false);
    comp.detach();
  });

  test('渲染四个维度：学历 5 项、婚姻 3 项、职业 11 项、年龄/身高选项池', () => {
    const comp = render();
    comp.instance.onToggle();
    expect(comp.data.chipGroups).toHaveLength(3); // 学历/婚姻/职业
    const titles = comp.data.chipGroups.map((g) => g.title);
    expect(titles).toEqual(['学历', '婚姻状况', '职业']);
    expect(comp.data.chipGroups[0].items).toHaveLength(5); // EDUCATIONS
    expect(comp.data.chipGroups[1].items).toHaveLength(3); // EMOTIONAL_STATUS
    expect(comp.data.chipGroups[2].items).toHaveLength(11); // JOBS
    expect(comp.data.ageOptions[0]).toBe(18);
    expect(comp.data.heightOptions[0]).toBe(140);
    comp.detach();
  });

  test('多选 chips：toggle 选中 → chipGroups on 态更新', () => {
    const comp = render();
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selEducations', item: '本科' } } });
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selEducations', item: '硕士' } } });
    expect(comp.data.selEducations).toEqual(['本科', '硕士']);
    const eduGroup = comp.data.chipGroups.find((g) => g.title === '学历');
    expect(eduGroup.items.find((i) => i.text === '本科').on).toBe(true);
    expect(eduGroup.items.find((i) => i.text === '大专').on).toBe(false);
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selEducations', item: '本科' } } });
    expect(comp.data.selEducations).toEqual(['硕士']);
    comp.detach();
  });

  test('范围选择：picker change 写入对应字段（年龄/身高）', () => {
    const comp = render();
    // e.detail.value 是选项下标；ageOptions[2] = 20，heightOptions[5] = 150
    comp.instance.onRangeChange({ currentTarget: { dataset: { field: 'ageMin' } }, detail: { value: '2' } });
    comp.instance.onRangeChange({ currentTarget: { dataset: { field: 'heightMax' } }, detail: { value: '5' } });
    expect(comp.data.selAgeMin).toBe(20);
    expect(comp.data.selHeightMax).toBe(150);
    comp.detach();
  });

  test('省市联动：选省加载市列表，选市加入已选城市 chips，重复不加', () => {
    const comp = render();
    const provIdx = comp.data.provinces.indexOf('广东省');
    comp.instance.onProvinceChange({ detail: { value: String(provIdx) } });
    expect(comp.data.selProvince).toBe('广东省');
    expect(comp.data.cityOptions).toContain('深圳市');
    const cityIdx = comp.data.cityOptions.indexOf('深圳市');
    comp.instance.onCityChange({ detail: { value: String(cityIdx) } });
    expect(comp.data.selCities).toEqual(['广东省 深圳市']);
    comp.instance.onCityChange({ detail: { value: String(cityIdx) } }); // 重复
    expect(comp.data.selCities).toEqual(['广东省 深圳市']);
    comp.detach();
  });

  test('应用：emit change 携带完整 filter（只含已选维度）', () => {
    const comp = render();
    const spy = jest.fn();
    comp.instance.triggerEvent = spy;
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selJobs', item: '金融' } } });
    comp.instance.onRangeChange({ currentTarget: { dataset: { field: 'ageMin' } }, detail: { value: '7' } }); // 25
    comp.instance.onApply();
    expect(spy).toHaveBeenCalledWith('change', {
      filter: { ageMin: 25, jobs: ['金融'] },
    });
    comp.detach();
  });

  test('重置：清空全部选择并 emit 空 filter', () => {
    const comp = render();
    const spy = jest.fn();
    comp.instance.triggerEvent = spy;
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selCities', item: '广东省 深圳市' } } });
    comp.instance.onReset();
    expect(comp.data.selCities).toEqual([]);
    expect(comp.data.selAgeMin).toBe('不限');
    expect(spy).toHaveBeenCalledWith('change', { filter: {} });
    comp.detach();
  });
});
