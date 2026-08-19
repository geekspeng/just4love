// getProfileDetail 云函数 —— 资料详情：登录/配额校验 + 查看日志 + 按角色裁剪隐私
// 入参 { profileId }，返回见数据契约（login required / not found / quota exceeded / 成功 VO）。
// 配额 = 当日可查看的不同嘉宾数（view_logs 按 targetId 去重，重复看不重复计数）。
// 管理员与本人直看隐私明文且不写日志；其余角色隐私整段剔除（P3 授权流激活）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const DEFAULT_QUOTAS = { normal: 5, verified: 15 }; // config/quotas 可覆盖（P4 前在控制台改）
const VERIFIED_ROLES = ['verified', 'admin'];

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

// 云函数运行于 UTC；配额按东八区日界重置
function toDateKey(d) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// CardVO：与 listProfiles 的 toCardVO 保持同构，改字段须两边同步
function toCardVO(p, role) {
  return {
    _id: p._id,
    basic: p.basic || {},
    about: p.about || {},
    album: p.album || [],
    stories: p.stories || [],
    tags: p.tags || {},
    verified: VERIFIED_ROLES.indexOf(role) >= 0,
  };
}
function toFullVO(p, role) {
  const vo = toCardVO(p, role);
  vo.privacy = p.privacy || {};
  return vo;
}

// 读 config/quotas（数字校验后覆盖默认；文档/集合缺失用默认）
async function loadQuotas(db) {
  try {
    const cfg = await db.collection('config').doc('quotas').get();
    const c = cfg.data || {};
    return {
      normal: Number.isFinite(c.normal) ? c.normal : DEFAULT_QUOTAS.normal,
      verified: Number.isFinite(c.verified) ? c.verified : DEFAULT_QUOTAS.verified,
    };
  } catch (e) {
    return DEFAULT_QUOTAS;
  }
}

async function getProfileDetailByOpenid(openid, profileId, db) {
  if (!profileId || typeof profileId !== 'string') return { error: 'not found' };

  // 游客 = 无 users 文档（未经 login 建档）
  const users = db.collection('users');
  const meArr = await users.where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const me = meArr.data[0];

  let target;
  try {
    target = (await db.collection('profiles').doc(profileId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }

  // 目标用户角色 → verified 标识（查无用户按 normal）
  const tArr = await users.where({ openid: target.openid }).get();
  const targetRole = tArr.data.length > 0 ? tArr.data[0].role : 'normal';
  const isVerified = VERIFIED_ROLES.indexOf(targetRole) >= 0;

  // 本人：隐私明文、不占配额、不写日志
  if (target.openid === me.openid) {
    return { profile: toFullVO(target, targetRole), verified: isVerified, self: true, quota: null };
  }
  // 管理员：不限、隐私明文、不写日志（避免污染 P3「谁看过我」）
  if (me.role === 'admin') {
    return { profile: toFullVO(target, targetRole), verified: isVerified, self: false, quota: { used: 0, limit: -1 } };
  }

  const quotas = await loadQuotas(db);
  const limit = me.role === 'verified' ? quotas.verified : quotas.normal; // 未知角色按 normal

  const dateKey = toDateKey(new Date());
  const logs = await db.collection('view_logs').where({ viewerOpenid: openid, dateKey }).get();
  const seen = new Set(logs.data.map((l) => l.targetId));

  if (seen.has(profileId)) {
    return { profile: toCardVO(target, targetRole), verified: isVerified, self: false, quota: { used: seen.size, limit } };
  }
  if (seen.size >= limit) {
    return { error: 'quota exceeded', quota: { used: seen.size, limit } };
  }
  await db.collection('view_logs').add({
    data: {
      viewerOpenid: openid, viewerId: me._id,
      targetId: profileId, targetOpenid: target.openid,
      dateKey, createdAt: new Date().toISOString(),
    },
  });
  return { profile: toCardVO(target, targetRole), verified: isVerified, self: false, quota: { used: seen.size + 1, limit } };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    return await getProfileDetailByOpenid(openid, (event || {}).profileId, getDb());
  } catch (e) {
    console.error('[getProfileDetail] failed:', e);
    return { error: 'internal error' };
  }
};
exports.getProfileDetailByOpenid = getProfileDetailByOpenid;
exports.toDateKey = toDateKey;
