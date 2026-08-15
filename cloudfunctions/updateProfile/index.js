// updateProfile 云函数 —— 保存我的资料
// patch 顶层仅允许 basic/about/privacy/album/stories/tags，且为完整段对象（整段替换）。
// basic.nickname/gender/birthday/constellation 仅在 basicInit 前可写；
// 首次三者齐备即置 basicInit=true（之后锁定，同值重提允许）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const PATCH_KEYS = ['basic', 'about', 'privacy', 'album', 'stories', 'tags'];
const LOCKED_BASIC = ['nickname', 'gender', 'birthday', 'constellation'];
const BASIC_KEYS = LOCKED_BASIC.concat(['avatarFileID', 'signature']);
const ABOUT_KEYS = [
  'aboutMe', 'aboutYou', 'loveGoal', 'emotionalStatus', 'height', 'education',
  'job', 'city', 'hometown', 'school', 'familyBackground', 'smoke', 'drink', 'gamble',
];
const PRIVACY_KEYS = { asset: ['house', 'car', 'income'], contact: ['phone', 'wechat'] };
const TAG_KEYS = ['hobby', 'personality', 'food', 'media'];
const ALBUM_MAX = 5;
const STORIES_MAX = 5;
const TAGS_PER_CATEGORY_MAX = 5;
const FAMILY_MAX = 12;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

const isStr = (v) => typeof v === 'string';
const isStrArray = (v, max) =>
  Array.isArray(v) && v.every(isStr) && v.length <= max && new Set(v).size === v.length;

// 返回 { patch }（净化后的段）+ { initNow }，或 { error }
function sanitizePatch(patch, existing) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { error: 'invalid patch' };
  for (const k of Object.keys(patch)) {
    if (PATCH_KEYS.indexOf(k) < 0) return { error: 'invalid patch key: ' + k };
  }
  const out = {};
  const lockedInit = !!(existing && existing.basicInit);
  const eb = (existing && existing.basic) || {};

  if (patch.basic !== undefined) {
    const b = patch.basic;
    if (!b || typeof b !== 'object') return { error: 'invalid basic' };
    const nb = {};
    for (const key of Object.keys(b)) {
      if (BASIC_KEYS.indexOf(key) < 0) continue; // 未知键静默剔除
      if (!isStr(b[key])) return { error: 'invalid basic.' + key };
      if (LOCKED_BASIC.indexOf(key) >= 0 && lockedInit && b[key] !== eb[key]) {
        return { error: 'basic locked' };
      }
      nb[key] = b[key];
    }
    out.basic = nb;
  }

  if (patch.about !== undefined) {
    const a = patch.about;
    if (!a || typeof a !== 'object') return { error: 'invalid about' };
    const na = {};
    for (const key of ABOUT_KEYS) {
      if (!(key in a)) continue;
      const v = a[key];
      if (key === 'height') {
        if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
          return { error: 'invalid about.height' };
        }
        na.height = v;
      } else if (key === 'familyBackground') {
        if (!isStrArray(v, FAMILY_MAX)) return { error: 'invalid about.familyBackground' };
        na[key] = v;
      } else {
        if (!isStr(v)) return { error: 'invalid about.' + key };
        na[key] = v;
      }
    }
    out.about = na;
  }

  if (patch.privacy !== undefined) {
    const pr = patch.privacy;
    if (!pr || typeof pr !== 'object') return { error: 'invalid privacy' };
    const np = {};
    for (const section of Object.keys(PRIVACY_KEYS)) {
      if (pr[section] === undefined) continue;
      const obj = pr[section] || {};
      if (typeof obj !== 'object') return { error: 'invalid privacy' };
      const clean = {};
      for (const k of PRIVACY_KEYS[section]) {
        if (k in obj) {
          if (!isStr(obj[k])) return { error: 'invalid privacy' };
          clean[k] = obj[k];
        }
      }
      np[section] = clean;
    }
    out.privacy = np;
  }

  if (patch.album !== undefined) {
    const al = patch.album;
    if (!Array.isArray(al) || al.length > ALBUM_MAX) return { error: 'invalid album' };
    const cats = new Set();
    for (const it of al) {
      if (!it || typeof it !== 'object' || !isStr(it.category) || !it.category ||
          !isStr(it.fileID) || !it.fileID) return { error: 'invalid album item' };
      if (cats.has(it.category)) return { error: 'duplicate album category' };
      cats.add(it.category);
    }
    out.album = al;
  }

  if (patch.stories !== undefined) {
    const st = patch.stories;
    if (!Array.isArray(st) || st.length > STORIES_MAX) return { error: 'invalid stories' };
    const topics = new Set();
    for (const it of st) {
      if (!it || typeof it !== 'object' || !isStr(it.topic) || !it.topic ||
          !isStr(it.audioFileID) || !it.audioFileID) return { error: 'invalid story item' };
      if (topics.has(it.topic)) return { error: 'duplicate story topic' };
      topics.add(it.topic);
    }
    out.stories = st;
  }

  if (patch.tags !== undefined) {
    const tg = patch.tags;
    if (!tg || typeof tg !== 'object') return { error: 'invalid tags' };
    const nt = {};
    for (const k of Object.keys(tg)) {
      if (TAG_KEYS.indexOf(k) < 0) return { error: 'invalid tags key: ' + k };
      if (!isStrArray(tg[k], TAGS_PER_CATEGORY_MAX)) return { error: 'invalid tags.' + k };
      nt[k] = tg[k];
    }
    out.tags = nt;
  }

  const initNow = !lockedInit && !!(out.basic && out.basic.nickname && out.basic.gender && out.basic.birthday);
  return { patch: out, initNow };
}

async function updateProfileByOpenid(openid, patch, db) {
  const users = db.collection('users');
  const found = await users.where({ openid }).get();
  if (found.data.length === 0) return { error: 'user not found' };
  const user = found.data[0];

  const profiles = db.collection('profiles');
  const existingArr = await profiles.where({ openid }).get();
  const existing = existingArr.data[0] || {
    openid, userId: user._id, basicInit: false,
    basic: {}, about: {}, privacy: {}, album: [], stories: [], tags: {},
  };

  const sanitized = sanitizePatch(patch, existing);
  if (sanitized.error) return { error: sanitized.error };

  const merged = JSON.parse(JSON.stringify(existing));
  merged.openid = openid;
  merged.userId = user._id;
  Object.keys(sanitized.patch).forEach((k) => { merged[k] = sanitized.patch[k]; });
  if (sanitized.initNow) merged.basicInit = true;
  merged.updatedAt = new Date().toISOString();

  if (existingArr.data.length > 0) {
    await profiles.doc(existing._id).set({ data: merged });
  } else {
    await profiles.add({ data: merged });
  }
  return { profile: merged };
}

exports.main = async (event) => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const openid = cloud.getWXContext().OPENID;
  return updateProfileByOpenid(openid, (event || {}).patch, getDb());
};
exports.updateProfileByOpenid = updateProfileByOpenid;
