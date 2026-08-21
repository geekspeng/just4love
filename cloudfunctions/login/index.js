// login 云函数 —— 微信静默登录
// getWXContext() 取 openid；首次登录自动创建 users 文档并生成嘉宾编号
//（counters 集合原子自增，J0001 递增）。返回 { user, isNew }。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

// 嘉宾编号：counters/guestNo 自增后读取。
// 已知限制：update(inc) 原子但随后的 get 并非原子，极端并发下可能重号；P1 低并发可接受。
async function nextGuestNo(db) {
  const counters = db.collection('counters');
  const doc = counters.doc('guestNo');
  try {
    await doc.get();
  } catch (e) {
    await counters.add({ data: { _id: 'guestNo', seq: 0 } });
  }
  await doc.update({ data: { seq: db.command.inc(1) } });
  const after = await doc.get();
  return 'J' + String(after.data.seq).padStart(4, '0');
}

function toUserVO(u) {
  return {
    userId: u._id, openid: u.openid, phone: u.phone || '',
    role: u.role, guestNo: u.guestNo,
    verifiedTypes: Array.isArray(u.verifiedTypes) ? u.verifiedTypes : [], // P4 认证徽章/门槛直读
  };
}

async function loginWithOpenid(openid, db) {
  const users = db.collection('users');
  const found = await users.where({ openid }).get();
  if (found.data.length > 0) {
    return { isNew: false, user: toUserVO(found.data[0]) };
  }
  const guestNo = await nextGuestNo(db);
  const added = await users.add({
    data: { openid, phone: '', role: 'normal', guestNo, createdAt: new Date().toISOString() },
  });
  return {
    isNew: true,
    user: toUserVO({ _id: added._id, openid, phone: '', role: 'normal', guestNo }),
  };
}

exports.main = async () => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const { OPENID } = cloud.getWXContext();
    return await loginWithOpenid(OPENID, getDb());
  } catch (e) {
    console.error('[login] failed:', e);
    return { error: 'internal error' };
  }
};
exports.loginWithOpenid = loginWithOpenid;
exports.nextGuestNo = nextGuestNo;
