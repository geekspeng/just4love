// bindPhone 云函数 —— 手机号可选绑定（企业主体能力）
// 前端 getPhoneNumber 按钮拿到 e.detail.code 后调用；openapi 解码并写入 users.phone。
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

async function bindPhoneByOpenid(openid, code, db, openapi) {
  const users = db.collection('users');
  const found = await users.where({ openid }).get();
  if (found.data.length === 0) return { error: 'user not found' };
  let phone = '';
  try {
    const res = await openapi.phonenumber.getPhoneNumber({ code });
    phone = (res && res.phoneInfo && res.phoneInfo.phoneNumber) || '';
  } catch (e) {
    phone = '';
  }
  if (!phone) return { error: 'phone code invalid' };
  await users.doc(found.data[0]._id).update({ data: { phone } });
  return { phone };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    return await bindPhoneByOpenid(
      cloud.getWXContext().OPENID,
      (event || {}).code,
      getDb(),
      cloud.openapi
    );
  } catch (e) {
    console.error('[bindPhone] failed:', e);
    return { error: 'internal error' };
  }
};
exports.bindPhoneByOpenid = bindPhoneByOpenid;
