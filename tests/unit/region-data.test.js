// tests/unit/region-data.test.js —— 省市二级数据结构守卫（scripts/gen-region-data.js 生成，勿手改）
const { PROVINCES, CITY_MAP } = require('../../miniprogram/utils/region-data.js');

describe('utils/region-data', () => {
  test('省级列表 ≥30 项、无重复、含关键省市', () => {
    expect(PROVINCES.length).toBeGreaterThanOrEqual(30);
    const values = PROVINCES.map((p) => p.value);
    expect(new Set(values).size).toBe(values.length);
    ['北京市', '上海市', '广东省', '湖南省', '四川省'].forEach((x) => expect(values).toContain(x));
    PROVINCES.forEach((p) => expect(p.label).toBe(p.value)); // 值为文案
  });

  test('每个省都有对应城市列表：键集合一致、非空、无重复', () => {
    const provinceValues = PROVINCES.map((p) => p.value);
    expect(Object.keys(CITY_MAP).sort()).toEqual(provinceValues.slice().sort());
    provinceValues.forEach((prov) => {
      const cities = CITY_MAP[prov];
      expect(Array.isArray(cities)).toBe(true);
      expect(cities.length).toBeGreaterThan(0);
      const cityValues = cities.map((c) => c.value);
      expect(new Set(cityValues).size).toBe(cityValues.length);
      cities.forEach((c) => expect(c.label).toBe(c.value));
    });
  });

  test('关键省份的城市含规格地名（存储格式「省 市」可由两个 value 拼出）', () => {
    expect(CITY_MAP['广东省'].map((c) => c.value)).toEqual(expect.arrayContaining(['广州市', '深圳市']));
    expect(CITY_MAP['湖南省'].map((c) => c.value)).toContain('长沙市');
    expect(CITY_MAP['北京市'].map((c) => c.value)).toContain('东城区');
  });
});
