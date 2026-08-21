// setupDb 云函数 —— 环境初始化/诊断：幂等创建集合并写入默认配额
// 返回 { users: 'created'|<errMsg>, ..., config: ..., view_logs: ..., quotas: 'created'|'exists', usersQuery: ... }
// 部署后在小程序端或云控制台调用一次即可；集合已存在时 createCollection 报错属预期。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const COLLECTIONS = [
  'users', 'counters', 'profiles', 'config', 'view_logs',
  'interactions', 'consents', 'notifications', 'reports', 'quota_counters',
  'verifications',
];
const DEFAULT_QUOTAS = { normal: 5, verified: 15 };

// 幂等写入 config/quotas：不存在则建默认，存在不动（控制台改过的不覆盖）
async function seedQuotaConfig(db) {
  const doc = db.collection('config').doc('quotas');
  try {
    await doc.get();
    return 'exists';
  } catch (e) {
    await doc.set({ data: { normal: DEFAULT_QUOTAS.normal, verified: DEFAULT_QUOTAS.verified } });
    return 'created';
  }
}

exports.main = async () => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const db = cloud.database();
  const out = {};
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
      out[name] = 'created';
    } catch (e) {
      out[name] = String((e && e.errMsg) || e.message || e);
    }
  }
  out.quotas = await seedQuotaConfig(db);
  // 跑一次 login 的真实查询路径，确认数据库可用（回传原始错误便于排障）
  try {
    const r = await db.collection('users').where({ openid: 'probe' }).get();
    out.usersQuery = 'ok:' + r.data.length;
  } catch (e) {
    out.usersQuery = String((e && e.errMsg) || e.message || e);
  }
  return out;
};
exports.seedQuotaConfig = seedQuotaConfig;
