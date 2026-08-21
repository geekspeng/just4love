// getGroupQr 云函数 —— 交友群二维码（仅认证用户/管理员可见，P4 运营功能）
// 入参无；返回 { fileID }（未配置为 null）或 { error: 'login required' | 'forbidden' }。
// fileID 由管理页经 admin/saveGroupQr 写入 config/groupQr。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const VERIFIED_ROLES = ['verified', 'admin'];

async function getGroupQrByOpenid(openid, db) {
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  if (VERIFIED_ROLES.indexOf(meArr.data[0].role) < 0) return { error: 'forbidden' };
  try {
    const doc = (await db.collection('config').doc('groupQr').get()).data;
    return { fileID: doc.fileID || null };
  } catch (e) {
    return { fileID: null }; // 未配置
  }
}

exports.main = async () => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    return await getGroupQrByOpenid(cloud.getWXContext().OPENID, getDb());
  } catch (e) {
    console.error('[getGroupQr] failed:', e);
    return { error: 'internal error' };
  }
};
exports.getGroupQrByOpenid = getGroupQrByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
