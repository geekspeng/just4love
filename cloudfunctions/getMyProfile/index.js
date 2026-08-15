// getMyProfile 云函数 —— 取当前登录用户的 users + profiles 文档
// 返回 { user, profile }；profile 不存在时为 null（前端用 createEmptyProfile 兜底）。
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

function toUserVO(u) {
  return {
    userId: u._id, openid: u.openid, phone: u.phone || '',
    role: u.role, guestNo: u.guestNo,
  };
}

async function getMyProfileByOpenid(openid, db) {
  const users = db.collection('users');
  const found = await users.where({ openid }).get();
  if (found.data.length === 0) return { error: 'user not found' };
  const profiles = db.collection('profiles');
  const pf = await profiles.where({ openid }).get();
  return { user: toUserVO(found.data[0]), profile: pf.data[0] || null };
}

exports.main = async () => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  return getMyProfileByOpenid(cloud.getWXContext().OPENID, getDb());
};
exports.getMyProfileByOpenid = getMyProfileByOpenid;
