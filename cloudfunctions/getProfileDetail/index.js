// getProfileDetail 云函数 —— 资料详情：登录/配额校验 + 查看日志 + 按角色裁剪隐私
// 入参 { profileId }，返回见数据契约（login required / not found / quota exceeded / 成功 VO）。
// 配额 = 当日不同嘉宾数（quota_counters 原子计数准入；view_logs 记录复看去重与「谁看过我」）。
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

// 通知落库（部署根隔离：interact/requestConsent/respondConsent 各持一份同构实现，字段形状保持同步）
async function notify(db, toOpenid, type, payload) {
  await db.collection('notifications').add({
    data: { toOpenid, type, payload, read: false, createdAt: new Date().toISOString() },
  });
}

// 配额原子计数：inc 原子增后读回校验，超限即回退（并发下唯一计数入口，P2 终审遗留的原子化方案）
// 已看目标的复用路径不进入本函数（view_logs 去重口径不变）。
async function acquireQuota(db, openid, dateKey, limit) {
  const counters = db.collection('quota_counters');
  const id = openid + '_' + dateKey;
  try {
    await counters.doc(id).get();
  } catch (e) {
    await counters.doc(id).set({ data: { count: 0 } });
  }
  await counters.doc(id).update({ data: { count: db.command.inc(1) } });
  const after = (await counters.doc(id).get()).data.count;
  if (after > limit) {
    await counters.doc(id).update({ data: { count: db.command.inc(-1) } });
    return { ok: false, used: limit };
  }
  return { ok: true, used: after };
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

// 非 self/admin 视角：按 consents 状态组装 consents 响应与解锁的隐私子段
async function buildConsentView(db, openid, target) {
  const arr = await db.collection('consents')
    .where({ requesterOpenid: openid, ownerOpenid: target.openid }).get();
  const status = { contact: 'none', asset: 'none' };
  for (const c of arr.data) status[c.field] = c.status;
  const privacy = {};
  const src = target.privacy || {};
  if (status.contact === 'approved') privacy.contact = src.contact || {};
  if (status.asset === 'approved') privacy.asset = src.asset || {};
  return { status, privacy: (privacy.contact || privacy.asset) ? privacy : undefined };
}

function withConsentPrivacy(vo, cv) {
  if (cv.privacy) vo.privacy = cv.privacy;
  return vo;
}

// 读 config/quotas（数字且非负才覆盖默认；-1 与「不限」语义冲突，防运营误配关停）
async function loadQuotas(db) {
  try {
    const cfg = await db.collection('config').doc('quotas').get();
    const c = cfg.data || {};
    return {
      normal: Number.isFinite(c.normal) && c.normal >= 0 ? c.normal : DEFAULT_QUOTAS.normal,
      verified: Number.isFinite(c.verified) && c.verified >= 0 ? c.verified : DEFAULT_QUOTAS.verified,
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

  // 未完善资料不上列表也不可被直链/分享查看（P2 终审遗留防御）
  if (!target.basicInit) return { error: 'not found' };
  // 强制资料隐藏（P4 举报处置/管理页）：直链/分享一律 not found（管理员同口径，管理页走 listGuests）
  if (target.forceHidden) return { error: 'not found' };

  // 目标用户角色 → verified 标识（查无用户按 normal）
  const tArr = await users.where({ openid: target.openid }).get();
  const targetRole = tArr.data.length > 0 ? tArr.data[0].role : 'normal';
  const isVerified = VERIFIED_ROLES.indexOf(targetRole) >= 0;

  // 本人：隐私明文、不占配额、不写日志
  if (target.openid === me.openid) {
    return { profile: toFullVO(target, targetRole), verified: isVerified, self: true, quota: null, consents: { contact: 'approved', asset: 'approved' } };
  }
  // 管理员：不限、隐私明文、不写日志（避免污染 P3「谁看过我」）
  if (me.role === 'admin') {
    return { profile: toFullVO(target, targetRole), verified: isVerified, self: false, quota: { used: 0, limit: -1 }, consents: { contact: 'approved', asset: 'approved' } };
  }

  const quotas = await loadQuotas(db);
  const limit = me.role === 'verified' ? quotas.verified : quotas.normal; // 未知角色按 normal

  const dateKey = toDateKey(new Date());
  const logs = await db.collection('view_logs').where({ viewerOpenid: openid, dateKey }).get();
  const seen = new Set(logs.data.map((l) => l.targetId));

  const cv = await buildConsentView(db, openid, target);

  if (seen.has(profileId)) {
    return { profile: withConsentPrivacy(toCardVO(target, targetRole), cv), verified: isVerified, self: false, quota: { used: seen.size, limit }, consents: cv.status };
  }
  const acquired = await acquireQuota(db, openid, dateKey, limit);
  if (!acquired.ok) {
    return { error: 'quota exceeded', quota: { used: limit, limit } };
  }
  await db.collection('view_logs').add({
    data: {
      viewerOpenid: openid, viewerId: me._id,
      targetId: profileId, targetOpenid: target.openid,
      dateKey, createdAt: new Date().toISOString(),
    },
  });
  // 「被查看」通知（首次查看当天才走到这里；快照冗余 nickname/guestNo 免 join）
  const myProfileArr = await db.collection('profiles').where({ openid }).get();
  const myBasic = (myProfileArr.data[0] && myProfileArr.data[0].basic) || {};
  await notify(db, target.openid, 'view', {
    nickname: myBasic.nickname || '',
    guestNo: myBasic.guestNo || me.guestNo || '',
    profileId: myProfileArr.data[0] ? myProfileArr.data[0]._id : null,
  });
  return { profile: withConsentPrivacy(toCardVO(target, targetRole), cv), verified: isVerified, self: false, quota: { used: acquired.used, limit }, consents: cv.status };
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
