// utils/constellation.js —— 生日 → 星座（纯函数，便于单元测试）
// 仅接受 'YYYY-MM-DD'（微信 picker mode="date" 的输出格式）。

// 每个星座的起始日 [月, 日, 星座名]，按时间顺序排列
const STARTS = [
  [1, 20, '水瓶座'], [2, 19, '双鱼座'], [3, 21, '白羊座'], [4, 20, '金牛座'],
  [5, 21, '双子座'], [6, 22, '巨蟹座'], [7, 23, '狮子座'], [8, 23, '处女座'],
  [9, 23, '天秤座'], [10, 24, '天蝎座'], [11, 23, '射手座'], [12, 22, '摩羯座'],
];

function getConstellation(birthday) {
  if (typeof birthday !== 'string') return '';
  const m = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';

  // 各月份最大天数（二月根据闰年判断）
  const maxDays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // 闰年判断：能被4整除且不能被100整除，或能被400整除
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (isLeap) maxDays[2] = 29;
  if (day > maxDays[month]) return '';

  // 找到第一个「尚未到达」的起始日，其前一项即当前星座
  const idx = STARTS.findIndex(([sm, sd]) => month < sm || (month === sm && day < sd));
  if (idx === -1 || idx === 0) return '摩羯座'; // 12/22 之后 与 1/20 之前 都是摩羯
  return STARTS[idx - 1][2];
}

module.exports = { getConstellation };
