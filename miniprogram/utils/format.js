// utils/format.js —— 展示用的格式化工具（纯函数，便于单元测试）

/**
 * 根据出生年份计算年龄字符串。
 * @param {number} birthYear 出生年份，如 1995
 * @returns {string} 如 "31岁"；非法输入返回 ""
 */
function formatAge(birthYear) {
  if (typeof birthYear !== 'number' || !Number.isFinite(birthYear)) return '';
  const year = new Date().getFullYear();
  const age = year - birthYear;
  if (!Number.isFinite(age) || age < 0 || age > 150) return '';
  return age + '岁';
}

/**
 * 身高（cm）格式化。
 * @param {number} cm 厘米
 * @returns {string} 如 "178cm"；非法返回 ""
 */
function formatHeight(cm) {
  if (typeof cm !== 'number' || !Number.isFinite(cm) || cm <= 0 || cm > 300) return '';
  return cm + 'cm';
}

/**
 * 距离格式化：米级显示 m，公里级显示 km。
 * @param {number} meters 米
 * @returns {string} 如 "500m"、"1.8km"；非法返回 ""
 */
function formatDistance(meters) {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return Math.round(meters) + 'm';
  return (meters / 1000).toFixed(1) + 'km';
}

module.exports = {
  formatAge,
  formatHeight,
  formatDistance,
};
