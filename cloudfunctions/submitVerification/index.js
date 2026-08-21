// submitVerification 云函数 —— 提交认证材料（身份/学历/职业；图片直传云存储后的 fileID 1-3 张）
// 每 (userId, type) 一文档：pending/approved 重复提交幂等 unchanged；rejected 重新提交复用同文档置回 pending。
// 审核由 admin 云函数 reviewVerification 处理（通过即升级 verified，配额 5→15 自动生效）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const TYPES = ['identity', 'education', 'career']; // 与前端 verification 页文案映射保持同步
const MATERIALS_MAX = 3;

async function submitVerificationByOpenid(openid, type, materialFileIDs, db) {
  if (TYPES.indexOf(type) < 0) return { error: 'invalid type' };
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const me = meArr.data[0];

  const mats = materialFileIDs === undefined ? [] : materialFileIDs;
  if (!Array.isArray(mats) || mats.length < 1 || mats.length > MATERIALS_MAX
    || !mats.every((s) => typeof s === 'string' && s)) {
    return { error: 'invalid materials' };
  }

  const col = db.collection('verifications');
  const existingArr = await col.where({ userId: me._id, type }).get();
  const existing = existingArr.data[0];
  if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
    return { status: existing.status, unchanged: true };
  }

  const now = new Date().toISOString();
  if (existing) {
    // rejected → 重新提交：复用同文档，材料覆盖
    await col.doc(existing._id).update({
      data: { materialFileIDs: mats, status: 'pending', updatedAt: now },
    });
    return { status: 'pending' };
  }
  await col.add({
    data: {
      userId: me._id, openid, type,
      materialFileIDs: mats, status: 'pending',
      reviewedBy: null, reviewedAt: null, createdAt: now, updatedAt: now,
    },
  });
  return { status: 'pending' };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    const e = event || {};
    return await submitVerificationByOpenid(openid, e.type, e.materialFileIDs, getDb());
  } catch (e) {
    console.error('[submitVerification] failed:', e);
    return { error: 'internal error' };
  }
};
exports.submitVerificationByOpenid = submitVerificationByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
