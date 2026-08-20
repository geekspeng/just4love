// requestConsent 云函数 —— 申请查看隐私字段（contact/asset）
// 入参 { ownerProfileId, field }；返回 { status, unchanged? } 或 { error }。
// 幂等：pending/approved 重复申请原样返回；rejected/revoked 重新申请（复用同文档）。
// 每次有效申请（新建或重新申请）通知 owner（consent_request）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const FIELDS = ['contact', 'asset'];

async function notify(db, toOpenid, type, payload) {
  await db.collection('notifications').add({
    data: { toOpenid, type, payload, read: false, createdAt: new Date().toISOString() },
  });
}

async function requestConsentByOpenid(openid, ownerProfileId, field, db) {
  if (FIELDS.indexOf(field) < 0) return { error: 'invalid field' };
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const me = meArr.data[0];

  let owner;
  try {
    owner = (await db.collection('profiles').doc(ownerProfileId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }
  if (!owner.basicInit) return { error: 'not found' };
  if (owner.openid === openid) return { error: 'cannot request self' };

  const consents = db.collection('consents');
  const existingArr = await consents.where({ requesterOpenid: openid, ownerOpenid: owner.openid, field }).get();
  const existing = existingArr.data[0];
  const now = new Date().toISOString();

  if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
    return { status: existing.status, unchanged: true };
  }

  // requester 快照（通知展示用）
  const myProfileArr = await db.collection('profiles').where({ openid }).get();
  const myBasic = (myProfileArr.data[0] && myProfileArr.data[0].basic) || {};
  const payload = {
    consentId: existing ? existing._id : null,
    field,
    nickname: myBasic.nickname || '',
    guestNo: myBasic.guestNo || me.guestNo || '',
    profileId: myProfileArr.data[0] ? myProfileArr.data[0]._id : null,
  };

  if (existing) {
    // rejected/revoked → 重新申请
    await consents.doc(existing._id).update({ data: { status: 'pending', updatedAt: now, decidedAt: null } });
    payload.consentId = existing._id;
    await notify(db, owner.openid, 'consent_request', payload);
    return { status: 'pending' };
  }
  const added = await consents.add({
    data: {
      requesterOpenid: openid, ownerOpenid: owner.openid, field,
      status: 'pending', createdAt: now, updatedAt: now, decidedAt: null,
    },
  });
  payload.consentId = added._id;
  await notify(db, owner.openid, 'consent_request', payload);
  return { status: 'pending' };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    const e = event || {};
    return await requestConsentByOpenid(openid, e.ownerProfileId, e.field, getDb());
  } catch (e) {
    console.error('[requestConsent] failed:', e);
    return { error: 'internal error' };
  }
};
exports.requestConsentByOpenid = requestConsentByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
