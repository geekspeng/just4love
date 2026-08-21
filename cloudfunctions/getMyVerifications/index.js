// getMyVerifications 云函数 —— 我的认证状态（三类固定顺序，认证页渲染）
// 入参无；返回 { list }，item：{ type, status: none/pending/approved/rejected, materialFileIDs, createdAt, updatedAt, reviewedAt }。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const TYPES = ['identity', 'education', 'career']; // 与 submitVerification 的 TYPES 保持同步

async function getMyVerificationsByOpenid(openid, db) {
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const mine = await db.collection('verifications').where({ userId: meArr.data[0]._id }).get();
  const byType = {};
  for (const v of mine.data) byType[v.type] = v;
  return {
    list: TYPES.map((t) => {
      const v = byType[t];
      return {
        type: t,
        status: v ? v.status : 'none',
        materialFileIDs: v ? v.materialFileIDs : [],
        createdAt: v ? v.createdAt : null,
        updatedAt: v ? v.updatedAt : null,
        reviewedAt: v ? v.reviewedAt : null,
      };
    }),
  };
}

exports.main = async () => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    return await getMyVerificationsByOpenid(cloud.getWXContext().OPENID, getDb());
  } catch (e) {
    console.error('[getMyVerifications] failed:', e);
    return { error: 'internal error' };
  }
};
exports.getMyVerificationsByOpenid = getMyVerificationsByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
