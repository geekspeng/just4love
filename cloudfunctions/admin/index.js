// admin 云函数 —— 管理后台聚合入口（event.action 路由，全部操作 role=admin 守卫）
// action 清单（子动作键避开路由键 action：审核用 decision、举报处置用 handle）：
//   listVerifications { status? }                        认证审核列表（join 嘉宾编号/昵称）
//   reviewVerification { verificationId, decision }      approve（升级 verified+verifiedTypes）/ reject
//   listGuests { keyword? }                              嘉宾搜索（编号/昵称包含）
//   setProfileFlags { profileId, listed?, forceHidden? } 上下架 / 强制资料隐藏
//   listReports { status? }                              举报列表（join 被举报人）
//   handleReport { reportId, handle }                    hide（联动 forceHidden）/ ignore
//   getConfig {}                                         { quotas, groupQrFileID }
//   saveQuotas { normal, verified }                      写 config/quotas（非负数字）
//   saveGroupQr { fileID }                               写 config/groupQr（群二维码）
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const DEFAULT_QUOTAS = { normal: 5, verified: 15 }; // 与 getProfileDetail 的默认保持同步

// ---- 认证审核 ----

async function listVerifications(db, status) {
  const col = db.collection('verifications');
  const q = status ? col.where({ status }) : col;
  const rows = await q.orderBy('createdAt', 'desc').limit(50).get();
  const list = [];
  for (const v of rows.data) {
    let guestNo = '';
    let nickname = '';
    try {
      const u = (await db.collection('users').doc(v.userId).get()).data;
      guestNo = u.guestNo || '';
    } catch (e) { /* 用户已删档则编号留空 */ }
    try {
      const pArr = await db.collection('profiles').where({ openid: v.openid }).get();
      nickname = (pArr.data[0] && pArr.data[0].basic && pArr.data[0].basic.nickname) || '';
    } catch (e) { /* 无资料则昵称留空 */ }
    list.push(Object.assign({}, v, { guestNo, nickname }));
  }
  return { list };
}

async function reviewVerification(db, adminOpenid, verificationId, decision) {
  if (decision !== 'approve' && decision !== 'reject') return { error: 'invalid decision' };
  let v;
  try {
    v = (await db.collection('verifications').doc(verificationId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }
  if (v.status !== 'pending') return { error: 'invalid state' };

  const now = new Date().toISOString();
  await db.collection('verifications').doc(verificationId).update({
    data: { status: decision === 'approve' ? 'approved' : 'rejected', reviewedBy: adminOpenid, reviewedAt: now, updatedAt: now },
  });

  if (decision === 'approve') {
    // 任一类通过即升级认证用户（已是 verified/admin 不动）；verifiedTypes 冗余到 users 供徽章/门槛直读
    const users = db.collection('users');
    const u = (await users.doc(v.userId).get()).data;
    const types = Array.isArray(u.verifiedTypes) ? u.verifiedTypes.slice() : [];
    if (types.indexOf(v.type) < 0) types.push(v.type);
    const patch = { verifiedTypes: types };
    if (u.role === 'normal') patch.role = 'verified';
    await users.doc(v.userId).update({ data: patch });
  }
  return { status: decision === 'approve' ? 'approved' : 'rejected' };
}

// ---- 嘉宾管理 ----

async function listGuests(db, keyword) {
  const rows = await db.collection('profiles')
    .where({ basicInit: true }).orderBy('createdAt', 'desc').limit(50).get();
  const kw = typeof keyword === 'string' ? keyword.trim() : '';
  const openids = rows.data.map((r) => r.openid);
  const roleMap = {};
  if (openids.length > 0) {
    const us = await db.collection('users').where({ openid: db.command.in(openids) }).get();
    for (const u of us.data) roleMap[u.openid] = u.role;
  }
  const list = rows.data
    .filter((r) => {
      if (!kw) return true;
      const b = r.basic || {};
      return ((b.guestNo || '').indexOf(kw) >= 0) || ((b.nickname || '').indexOf(kw) >= 0);
    })
    .map((r) => ({
      profileId: r._id,
      guestNo: (r.basic || {}).guestNo || '',
      nickname: (r.basic || {}).nickname || '',
      listed: r.listed !== false,
      forceHidden: !!r.forceHidden,
      role: roleMap[r.openid] || 'normal',
    }));
  return { list };
}

async function setProfileFlags(db, profileId, listed, forceHidden) {
  let p;
  try {
    p = (await db.collection('profiles').doc(profileId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }
  const patch = {};
  if (listed !== undefined) patch.listed = !!listed;
  if (forceHidden !== undefined) patch.forceHidden = !!forceHidden;
  if (Object.keys(patch).length > 0) {
    await db.collection('profiles').doc(profileId).update({ data: patch });
  }
  return {
    profileId,
    listed: patch.listed !== undefined ? patch.listed : p.listed !== false,
    forceHidden: patch.forceHidden !== undefined ? patch.forceHidden : !!p.forceHidden,
  };
}

// ---- 举报处理 ----

async function listReports(db, status) {
  const col = db.collection('reports');
  const q = status ? col.where({ status }) : col;
  const rows = await q.orderBy('createdAt', 'desc').limit(50).get();
  const list = [];
  for (const r of rows.data) {
    let targetNickname = '';
    let targetGuestNo = '';
    try {
      const p = (await db.collection('profiles').doc(r.targetId).get()).data;
      targetNickname = (p.basic || {}).nickname || '';
      targetGuestNo = (p.basic || {}).guestNo || '';
    } catch (e) { /* 资料已删则留空 */ }
    list.push(Object.assign({}, r, { targetNickname, targetGuestNo }));
  }
  return { list };
}

async function handleReport(db, reportId, handle) {
  if (handle !== 'hide' && handle !== 'ignore') return { error: 'invalid handle' };
  let r;
  try {
    r = (await db.collection('reports').doc(reportId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }
  if (r.status !== 'pending') return { error: 'invalid state' };

  const status = handle === 'hide' ? 'resolved' : 'ignored';
  await db.collection('reports').doc(reportId).update({ data: { status, handledAt: new Date().toISOString() } });
  if (handle === 'hide') {
    // 处置举报「隐藏」= 被举报人强制资料隐藏（列表排除 + 详情 not found）
    try {
      await db.collection('profiles').doc(r.targetId).update({ data: { forceHidden: true } });
    } catch (e) { /* 资料已删则跳过 */ }
  }
  return { status };
}

// ---- 配置（配额 / 群二维码） ----

async function getConfig(db) {
  let quotas = DEFAULT_QUOTAS;
  try {
    const cfg = (await db.collection('config').doc('quotas').get()).data;
    quotas = {
      normal: Number.isFinite(cfg.normal) && cfg.normal >= 0 ? cfg.normal : DEFAULT_QUOTAS.normal,
      verified: Number.isFinite(cfg.verified) && cfg.verified >= 0 ? cfg.verified : DEFAULT_QUOTAS.verified,
    };
  } catch (e) { /* 未配置走默认 */ }
  let groupQrFileID = null;
  try {
    groupQrFileID = (await db.collection('config').doc('groupQr').get()).data.fileID || null;
  } catch (e) { /* 未配置为 null */ }
  return { quotas, groupQrFileID };
}

async function saveQuotas(db, normal, verified) {
  // 与 getProfileDetail.loadQuotas 同口径：仅非负数字（-1 与「不限」语义冲突，防误配关停）
  if (!Number.isFinite(normal) || normal < 0 || !Number.isFinite(verified) || verified < 0) {
    return { error: 'invalid quotas' };
  }
  await db.collection('config').doc('quotas').set({ data: { normal, verified } });
  return { ok: true };
}

async function saveGroupQr(db, fileID) {
  if (typeof fileID !== 'string' || !fileID) return { error: 'invalid fileID' };
  await db.collection('config').doc('groupQr').set({ data: { fileID, updatedAt: new Date().toISOString() } });
  return { ok: true };
}

// ---- 路由 ----

async function adminByOpenid(openid, event, db) {
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  if (meArr.data[0].role !== 'admin') return { error: 'forbidden' };

  const e = event || {};
  switch (e.action) {
    case 'listVerifications': return listVerifications(db, e.status);
    case 'reviewVerification': return reviewVerification(db, openid, e.verificationId, e.decision);
    case 'listGuests': return listGuests(db, e.keyword);
    case 'setProfileFlags': return setProfileFlags(db, e.profileId, e.listed, e.forceHidden);
    case 'listReports': return listReports(db, e.status);
    case 'handleReport': return handleReport(db, e.reportId, e.handle);
    case 'getConfig': return getConfig(db);
    case 'saveQuotas': return saveQuotas(db, e.normal, e.verified);
    case 'saveGroupQr': return saveGroupQr(db, e.fileID);
    default: return { error: 'invalid action' };
  }
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    return await adminByOpenid(cloud.getWXContext().OPENID, event || {}, getDb());
  } catch (e) {
    console.error('[admin] failed:', e);
    return { error: 'internal error' };
  }
};
exports.adminByOpenid = adminByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
