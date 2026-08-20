// markRead 云函数 —— 通知已读标记
// 入参 { ids?: string[], all?: boolean }；仅操作自己名下未读，返回 { updated }。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

async function markReadByOpenid(openid, ids, all, db) {
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const col = db.collection('notifications');
  const mine = await col.where({ toOpenid: openid }).get();

  let targets;
  if (all) {
    targets = mine.data.filter((n) => !n.read);
  } else if (Array.isArray(ids) && ids.length > 0) {
    const idSet = new Set(ids);
    targets = mine.data.filter((n) => idSet.has(n._id) && !n.read);
  } else {
    return { updated: 0 };
  }
  for (const n of targets) {
    await col.doc(n._id).update({ data: { read: true } });
  }
  return { updated: targets.length };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const e = event || {};
    return await markReadByOpenid(cloud.getWXContext().OPENID, e.ids, !!e.all, getDb());
  } catch (e) {
    console.error('[markRead] failed:', e);
    return { error: 'internal error' };
  }
};
exports.markReadByOpenid = markReadByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
