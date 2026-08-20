// getNotifications 云函数 —— 我的通知列表（倒序 50 条 + 未读数）
// 入参无；返回 { list, unread }。payload 为写入时快照（T1/T2/T4 的 notify 保持同构）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

async function getNotificationsByOpenid(openid, db) {
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const res = await db.collection('notifications')
    .where({ toOpenid: openid }).orderBy('createdAt', 'desc').limit(50).get();
  return { list: res.data, unread: res.data.filter((n) => !n.read).length };
}

exports.main = async () => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    return await getNotificationsByOpenid(cloud.getWXContext().OPENID, getDb());
  } catch (e) {
    console.error('[getNotifications] failed:', e);
    return { error: 'internal error' };
  }
};
exports.getNotificationsByOpenid = getNotificationsByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
