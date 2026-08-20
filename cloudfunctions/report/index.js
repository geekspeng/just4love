// report 云函数 —— 举报提交（reports 落库 pending，P4 管理页处理）
// 入参 { targetId, type, description, screenshotFileIDs? }；返回 { reported: true } 或 { error }。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const REPORT_TYPES = ['虚假资料', '诈骗行为', '骚扰', '色情低俗', '其他']; // 与 miniprogram/utils/options.js 同步
const DESC_MAX = 200;
const SHOTS_MAX = 3;

async function reportByOpenid(openid, body, db) {
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const { targetId, type, description, screenshotFileIDs } = body || {};

  if (REPORT_TYPES.indexOf(type) < 0) return { error: 'invalid type' };
  if (typeof description !== 'string' || !description.trim() || description.length > DESC_MAX) {
    return { error: 'invalid description' };
  }
  const shots = screenshotFileIDs === undefined ? [] : screenshotFileIDs;
  if (!Array.isArray(shots) || shots.length > SHOTS_MAX || !shots.every((s) => typeof s === 'string' && s)) {
    return { error: 'invalid screenshots' };
  }

  let target;
  try {
    target = (await db.collection('profiles').doc(targetId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }

  await db.collection('reports').add({
    data: {
      reporterOpenid: openid, targetId, targetOpenid: target.openid,
      type, description: description.trim(), screenshotFileIDs: shots,
      status: 'pending', createdAt: new Date().toISOString(),
    },
  });
  return { reported: true };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    return await reportByOpenid(cloud.getWXContext().OPENID, event || {}, getDb());
  } catch (e) {
    console.error('[report] failed:', e);
    return { error: 'internal error' };
  }
};
exports.reportByOpenid = reportByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
