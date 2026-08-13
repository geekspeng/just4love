const {
  formatAge,
  formatHeight,
  formatDistance,
} = require('../../miniprogram/utils/format.js');

describe('utils/format', () => {
  describe('formatAge', () => {
    const currentYear = new Date().getFullYear();

    test('正常出生年份返回 "N岁"', () => {
      expect(formatAge(1995)).toBe(currentYear - 1995 + '岁');
      expect(formatAge(2000)).toBe(currentYear - 2000 + '岁');
    });

    test('边界：今年出生返回 "0岁"', () => {
      expect(formatAge(currentYear)).toBe('0岁');
    });

    test('非法输入返回空串', () => {
      expect(formatAge(undefined)).toBe('');
      expect(formatAge(null)).toBe('');
      expect(formatAge('1995')).toBe('');
      expect(formatAge(NaN)).toBe('');
    });

    test('不合理的年龄返回空串', () => {
      expect(formatAge(currentYear - 200)).toBe(''); // 年龄过大
      expect(formatAge(currentYear + 5)).toBe(''); // 未来年份
    });
  });

  describe('formatHeight', () => {
    test('正常身高返回 "Ncm"', () => {
      expect(formatHeight(178)).toBe('178cm');
      expect(formatHeight(165)).toBe('165cm');
    });

    test('非法输入返回空串', () => {
      expect(formatHeight(0)).toBe('');
      expect(formatHeight(-1)).toBe('');
      expect(formatHeight(999)).toBe('');
      expect(formatHeight(undefined)).toBe('');
      expect(formatHeight('178')).toBe('');
    });
  });

  describe('formatDistance', () => {
    test('米级距离显示 m', () => {
      expect(formatDistance(500)).toBe('500m');
      expect(formatDistance(0)).toBe('0m');
      expect(formatDistance(999)).toBe('999m');
    });

    test('公里级距离显示 km 并保留 1 位小数', () => {
      expect(formatDistance(1000)).toBe('1.0km');
      expect(formatDistance(1800)).toBe('1.8km');
      expect(formatDistance(12500)).toBe('12.5km');
    });

    test('非法输入返回空串', () => {
      expect(formatDistance(-1)).toBe('');
      expect(formatDistance(undefined)).toBe('');
      expect(formatDistance('500')).toBe('');
    });
  });
});
