// getProfile 云函数 —— 获取用户资料
//
// 骨架阶段使用 mock 数据，便于集成测试。
// 后续接入云数据库时，替换 queryProfile 为 db.collection('user').doc(userId).get()。
//
// 入参：event.userId
// 返回：{ profile } 或 { error }

// mock 用户库（后续替换为云数据库查询）
const MOCK_DB = {
  u_demo_1: {
    id: 'u_demo_1',
    nickname: '小鱼',
    age: 1995,
    height: 165,
    avatar: '',
    tag: '喜欢旅行',
  },
  u_demo_2: {
    id: 'u_demo_2',
    nickname: '大刘',
    age: 1990,
    height: 178,
    avatar: '',
    tag: '互联网从业',
  },
};

async function queryProfile(userId) {
  // TODO: 替换为云数据库查询
  // const cloud = require('wx-server-sdk');
  // cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  // const { data } = await cloud.database().collection('user').doc(userId).get();
  // return data;
  return MOCK_DB[userId] || null;
}

exports.main = async (event) => {
  const { userId } = event || {};
  if (!userId) {
    return { error: 'userId required' };
  }
  const profile = await queryProfile(userId);
  if (!profile) {
    return { error: 'profile not found' };
  }
  return { profile };
};

// 导出 queryProfile 便于集成测试时 mock 注入（云函数部署时不会被调用）
exports.queryProfile = queryProfile;
exports.MOCK_DB = MOCK_DB;
