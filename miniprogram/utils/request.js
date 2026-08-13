// utils/request.js —— 云函数调用封装
//
// 统一封装 wx.cloud.callFunction：异常时返回 null，由调用方判断。
// 当前为骨架阶段，页面尚未接入真实云函数。

/**
 * 调用云函数。
 * @param {string} name 云函数名
 * @param {object} data 入参
 * @returns {Promise<object|null>} 成功返回 result，失败返回 null
 */
function callFunction(name, data = {}) {
  if (typeof wx === 'undefined' || !wx.cloud) {
    return Promise.resolve(null);
  }
  return wx.cloud
    .callFunction({ name, data })
    .then((res) => (res && res.result ? res.result : null))
    .catch((err) => {
      console.error('[request] callFunction failed:', name, err);
      return null;
    });
}

module.exports = {
  callFunction,
};
