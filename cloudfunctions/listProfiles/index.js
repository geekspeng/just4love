// listProfiles 云函数 —— 「遇见」列表：筛选 + 分页 + 脱敏 + 实名标识
// 入参 { filter, page, pageSize }；filter 各维度缺省/空即不过滤（空数组不得传入 _.in——匹配不到任何值）。
// 返回 { list, page, hasMore }；list 项为 CardVO（不含 privacy/openid/userId，见数据契约）。
// 排序：createdAt 倒序（最新注册在前；匹配度加权是 P5 的事）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 20;
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

// CardVO：列表/详情共用对外形状（getProfileDetail 内有镜像实现，改字段须两边同步）
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

// filter → where 条件（空维度剔除）。年龄换算与前端 formatAge 同口径：当年 − 出生年。
function buildWhere(db, filter, viewerOpenid) {
  const _ = db.command;
  const f = filter || {};
  const where = { basicInit: true, openid: _.neq(viewerOpenid) };
  const year = new Date().getFullYear();

  if (Number.isFinite(f.ageMin) || Number.isFinite(f.ageMax)) {
    let cmd = null;
    if (Number.isFinite(f.ageMax)) cmd = _.gte(year - f.ageMax + '-01-01'); // 年龄上限 → 出生年下限
    if (Number.isFinite(f.ageMin)) {
      const upper = _.lte(year - f.ageMin + '-12-31'); // 年龄下限 → 出生年上限
      cmd = cmd ? cmd.lte(year - f.ageMin + '-12-31') : upper;
    }
    where['basic.birthday'] = cmd;
  }
  if (Number.isFinite(f.heightMin) || Number.isFinite(f.heightMax)) {
    let cmd = null;
    if (Number.isFinite(f.heightMin)) cmd = _.gte(f.heightMin);
    if (Number.isFinite(f.heightMax)) {
      const upper = _.lte(f.heightMax);
      cmd = cmd ? cmd.lte(f.heightMax) : upper;
    }
    where['about.height'] = cmd;
  }
  if (Array.isArray(f.educations) && f.educations.length) where['about.education'] = _.in(f.educations);
  if (Array.isArray(f.emotionalStatuses) && f.emotionalStatuses.length) where['about.emotionalStatus'] = _.in(f.emotionalStatuses);
  if (Array.isArray(f.cities) && f.cities.length) where['about.city'] = _.in(f.cities);
  if (Array.isArray(f.jobs) && f.jobs.length) where['about.job'] = _.in(f.jobs);
  return where;
}

async function listProfilesByOpenid(openid, filter, page, pageSize, db) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(pageSize) || DEFAULT_PAGE_SIZE)));
  const got = await db.collection('profiles')
    .where(buildWhere(db, filter, openid))
    .orderBy('createdAt', 'desc')
    .skip((p - 1) * size)
    .limit(size + 1) // 多取 1 条探测 hasMore，免 count()
    .get();
  const hasMore = got.data.length > size;
  const rows = hasMore ? got.data.slice(0, size) : got.data;

  // join users 拿角色 → verified 标识；查不到的用户按 normal 处理
  const roleMap = {};
  const openids = rows.map((r) => r.openid);
  if (openids.length > 0) {
    const users = await db.collection('users').where({ openid: db.command.in(openids) }).get();
    for (const u of users.data) roleMap[u.openid] = u.role;
  }
  const list = rows.map((r) => toCardVO(r, roleMap[r.openid]));
  return { list, page: p, hasMore };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    const e = event || {};
    return await listProfilesByOpenid(openid, e.filter, e.page, e.pageSize, getDb());
  } catch (e) {
    console.error('[listProfiles] failed:', e);
    return { error: 'internal error' };
  }
};
exports.listProfilesByOpenid = listProfilesByOpenid;
