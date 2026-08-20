// interact 云函数 —— 心动/无感：interactions 当前态度 upsert + 互配检测 + 通知
// 入参 { targetProfileId, type: 'like' | 'pass' }；返回 { matched } 或 { error }。
// 通知规则：态度变为 like 时——对方也 like → 双方各一条 match；否则对方一条 like。
// 重复同态度 like / 一切 pass 均不发通知。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

async function notify(db, toOpenid, type, payload) {
  await db.collection('notifications').add({
    data: { toOpenid, type, payload, read: false, createdAt: new Date().toISOString() },
  });
}

// 展示快照（与 getProfileDetail 的 notify 实现保持同步）
async function profileSnapshot(db, openid, fallbackGuestNo) {
  const arr = await db.collection('profiles').where({ openid }).get();
  const pf = arr.data[0];
  const b = (pf && pf.basic) || {};
  return {
    nickname: b.nickname || '',
    guestNo: b.guestNo || fallbackGuestNo || '',
    profileId: pf ? pf._id : null,
  };
}

async function interactByOpenid(openid, targetProfileId, type, db) {
  if (type !== 'like' && type !== 'pass') return { error: 'invalid type' };
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const me = meArr.data[0];

  let target;
  try {
    target = (await db.collection('profiles').doc(targetProfileId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }
  if (!target.basicInit) return { error: 'not found' };
  if (target.openid === openid) return { error: 'cannot interact self' };

  const now = new Date().toISOString();
  const inter = db.collection('interactions');
  const existingArr = await inter.where({ fromOpenid: openid, targetOpenid: target.openid }).get();
  const existing = existingArr.data[0];
  const wasLike = !!existing && existing.type === 'like';
  if (existing) {
    await inter.doc(existing._id).update({ data: { type, updatedAt: now } });
  } else {
    await inter.add({
      data: {
        fromOpenid: openid, fromUserId: me._id,
        targetId: targetProfileId, targetOpenid: target.openid,
        type, createdAt: now, updatedAt: now,
      },
    });
  }

  if (type === 'pass') return { matched: false };

  // 互配检测：对方对我也 like
  const revArr = await inter.where({ fromOpenid: target.openid, targetOpenid: openid, type: 'like' }).get();
  const matched = revArr.data.length > 0;

  if (!wasLike) { // 态度变化才通知（重复 like 静默）
    const mySnap = await profileSnapshot(db, openid, me.guestNo);
    if (matched) {
      const otherSnap = {
        nickname: (target.basic || {}).nickname || '',
        guestNo: (target.basic || {}).guestNo || '',
        profileId: targetProfileId,
      };
      await notify(db, openid, 'match', otherSnap);
      await notify(db, target.openid, 'match', mySnap);
    } else {
      await notify(db, target.openid, 'like', mySnap);
    }
  }
  return { matched };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    const e = event || {};
    return await interactByOpenid(openid, e.targetProfileId, e.type, getDb());
  } catch (e) {
    console.error('[interact] failed:', e);
    return { error: 'internal error' };
  }
};
exports.interactByOpenid = interactByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
