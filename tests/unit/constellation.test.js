// tests/unit/constellation.test.js —— 星座推算纯函数
const { getConstellation } = require('../../miniprogram/utils/constellation.js');

describe('utils/constellation', () => {
  test('星座起始日边界：1/19 摩羯、1/20 水瓶', () => {
    expect(getConstellation('1995-01-19')).toBe('摩羯座');
    expect(getConstellation('1995-01-20')).toBe('水瓶座');
  });

  test('星座起始日边界：12/21 射手、12/22 摩羯（跨年）', () => {
    expect(getConstellation('1990-12-21')).toBe('射手座');
    expect(getConstellation('1990-12-22')).toBe('摩羯座');
  });

  test('12 个星座全覆盖', () => {
    const cases = [
      ['1995-01-25', '水瓶座'], ['1995-02-25', '双鱼座'], ['1995-03-25', '白羊座'],
      ['1995-04-25', '金牛座'], ['1995-05-25', '双子座'], ['1995-06-25', '巨蟹座'],
      ['1995-07-25', '狮子座'], ['1995-08-25', '处女座'], ['1995-09-25', '天秤座'],
      ['1995-10-25', '天蝎座'], ['1995-11-25', '射手座'], ['1995-12-25', '摩羯座'],
    ];
    cases.forEach(([d, expected]) => expect(getConstellation(d)).toBe(expected));
  });

  test('非法输入返回空串', () => {
    expect(getConstellation('')).toBe('');
    expect(getConstellation('1995-1-5')).toBe('');   // 必须零填充
    expect(getConstellation('1995-13-01')).toBe(''); // 月非法
    expect(getConstellation('1995-00-10')).toBe('');
    expect(getConstellation('1995-06-31')).toBe(''); // 日非法
    expect(getConstellation(null)).toBe('');
    expect(getConstellation(19950615)).toBe('');
  });
});
