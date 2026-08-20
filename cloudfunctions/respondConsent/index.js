// respondConsent 云函数 —— owner 处理授权：approve（pending→approved）/ reject（pending→rejected）
// / revoke（approved→revoked，撤销后字段重新隐藏）。每次有效决定通知 requester（consent_result）。
// 入参 { consentId, action }；返回 { status } 或 { error }。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const ACTIONS = {
  approve: { from: 'pending', to: 'approved' },
  reject: { from: 'pending', to: 'rejected' },
  revoke: { from: 'approved', to: 'revoked' },
};

async function notify(db, toOpenid, type, payload) {
  await db.collection('notifications').add({
    data: { toOpenid, type, payload, read: false, createdAt: new Date().toISOString() },
  });
}

async function respondConsentByOpenid(db, openid, consentId, action) {
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };

  const rule = ACTIONS[action];
  if (!rule) return { error: 'invalid action' };

  let consent;
  try {
    consent = (await db.collection('consents').doc(consentId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }
  if (consent.ownerOpenid !== openid) return { error: 'forbidden' };
  if (consent.status !== rule.from) return { error: 'invalid state' };

  const now = new Date().toISOString();
  await db.collection('consents').doc(consentId).update({
    data: { status: rule.to, updatedAt: now, decidedAt: now },
  });

  // owner 快照（通知展示用）
  const ownerProfileArr = await db.collection('profiles').where({ openid }).get();
  const ob = (ownerProfileArr.data[0] && ownerProfileArr.data[0].basic) || {};
  await notify(db, consent.requesterOpenid, 'consent_result', {
    field: consent.field,
    status: rule.to,
    nickname: ob.nickname || '',
    guestNo: ob.guestNo || meArr.data[0].guestNo || '',
    profileId: ownerProfileArr.data[0] ? ownerProfileArr.data[0]._id : null,
  });
  return { status: rule.to };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    const e = event || {};
    return await respondConsentByOpenid(getDb(), openid, e.consentId, e.action);
  } catch (e) {
    console.error('[respondConsent] failed:', e);
    return { error: 'internal error' };
  }
};
exports.respondConsentByOpenid = respondConsentByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
