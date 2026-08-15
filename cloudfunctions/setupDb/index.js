// setupDb 云函数 —— 环境初始化/诊断：幂等创建所需集合并探测可查询性
// 返回 { users: 'created'|'exists'|<errMsg>, counters: ..., profiles: ..., usersQuery: ... }
// 部署后在小程序端或云控制台调用一次即可；集合已存在时 createCollection 报错属预期。
exports.main = async () => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const db = cloud.database();
  const out = {};
  for (const name of ['users', 'counters', 'profiles']) {
    try {
      await db.createCollection(name);
      out[name] = 'created';
    } catch (e) {
      out[name] = String((e && e.errMsg) || e.message || e);
    }
  }
  // 跑一次 login 的真实查询路径，确认数据库可用（回传原始错误便于排障）
  try {
    const r = await db.collection('users').where({ openid: 'probe' }).get();
    out.usersQuery = 'ok:' + r.data.length;
  } catch (e) {
    out.usersQuery = String((e && e.errMsg) || e.message || e);
  }
  return out;
};
