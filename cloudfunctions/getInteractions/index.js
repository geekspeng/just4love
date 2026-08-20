// getInteractions 云函数 —— 谁看过我（view_logs 倒序去重）/ 喜欢我的（interactions like）
// 入参 { type: 'view' | 'like' }；返回 { type, list }，item 见 T6 Interfaces。
// 仅返回 basicInit 嘉宾；matched = 对方喜欢我且我也喜欢对方（仅 like 有意义）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const VERIFIED_ROLES = ['verified', 'admin'];

async function getInteractionsByOpenid(openid, type, db) {
  if (type !== 'view' && type !== 'like') return { error: 'invalid type' };
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };

  let rows; // [{ openid, at }]
  if (type === 'view') {
    const logs = await db.collection('view_logs')
      .where({ targetOpenid: openid }).orderBy('createdAt', 'desc').limit(100).get();
    const byViewer = new Map(); // 去重保最新（倒序首见即最新）
    for (const l of logs.data) {
      if (!byViewer.has(l.viewerOpenid)) byViewer.set(l.viewerOpenid, { openid: l.viewerOpenid, at: l.createdAt });
    }
    rows = Array.from(byViewer.values());
  } else {
    const likes = await db.collection('interactions')
      .where({ targetOpenid: openid, type: 'like' }).orderBy('updatedAt', 'desc').limit(100).get();
    rows = likes.data.map((d) => ({ openid: d.fromOpenid, at: d.updatedAt }));
  }

  // join profiles（basicInit）与 users（verified）
  const openids = rows.map((r) => r.openid);
  const profileMap = {};
  const roleMap = {};
  if (openids.length > 0) {
    const _ = db.command;
    const ps = await db.collection('profiles').where({ openid: _.in(openids), basicInit: true }).get();
    for (const pf of ps.data) profileMap[pf.openid] = pf;
    const us = await db.collection('users').where({ openid: _.in(openids) }).get();
    for (const u of us.data) roleMap[u.openid] = u.role;
  }

  // matched：我也喜欢对方（仅 like）
  const myLikes = new Set();
  if (type === 'like' && openids.length > 0) {
    const mine = await db.collection('interactions').where({ fromOpenid: openid, type: 'like' }).get();
    for (const d of mine.data) myLikes.add(d.targetOpenid);
  }

  const list = rows
    .filter((r) => profileMap[r.openid])
    .map((r) => {
      const b = profileMap[r.openid].basic || {};
      return {
        profileId: profileMap[r.openid]._id,
        nickname: b.nickname || '',
        avatarFileID: b.avatarFileID || '',
        guestNo: b.guestNo || '',
        verified: VERIFIED_ROLES.indexOf(roleMap[r.openid]) >= 0,
        matched: type === 'like' && myLikes.has(r.openid),
        at: r.at,
      };
    });
  return { type, list };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    return await getInteractionsByOpenid(openid, (event || {}).type, getDb());
  } catch (e) {
    console.error('[getInteractions] failed:', e);
    return { error: 'internal error' };
  }
};
exports.getInteractionsByOpenid = getInteractionsByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
