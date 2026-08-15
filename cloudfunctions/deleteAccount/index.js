// deleteAccount 云函数 —— 注销账号（微信官方要求）
// 删除 users 与 profiles 文档；云存储文件不级联删除（P1 已知限制，见实现计划）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

async function deleteAccountByOpenid(openid, db) {
  const users = db.collection('users');
  const found = await users.where({ openid }).get();
  if (found.data.length === 0) return { deleted: false };
  await users.doc(found.data[0]._id).remove();
  const profiles = db.collection('profiles');
  const pf = await profiles.where({ openid }).get();
  if (pf.data.length > 0) {
    await profiles.doc(pf.data[0]._id).remove();
  }
  return { deleted: true };
}

exports.main = async () => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    return await deleteAccountByOpenid(cloud.getWXContext().OPENID, getDb());
  } catch (e) {
    console.error('[deleteAccount] failed:', e);
    return { error: 'internal error' };
  }
};
exports.deleteAccountByOpenid = deleteAccountByOpenid;
