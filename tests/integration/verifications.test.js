// tests/integration/verifications.test.js —— 认证流：submitVerification / getMyVerifications
const { createMockDb } = require('../helpers/mock-db.js');
const { submitVerificationByOpenid } = require('../../cloudfunctions/submitVerification/index.js');
const { getMyVerificationsByOpenid } = require('../../cloudfunctions/getMyVerifications/index.js');

function seed() {
  return createMockDb({
    users: {
      uA: { _id: 'uA', openid: 'o-a', role: 'normal', guestNo: 'J0001' },
    },
    verifications: {},
  });
}

describe('cloudfunctions/submitVerification', () => {
  test('游客 → login required；非法 type / 材料 0 张、4 张、非字符串 → 对应 error', async () => {
    const db = seed();
    expect(await submitVerificationByOpenid('o-x', 'identity', ['cloud://a'], db))
      .toEqual({ error: 'login required' });
    expect(await submitVerificationByOpenid('o-a', 'salary', ['cloud://a'], db))
      .toEqual({ error: 'invalid type' });
    expect(await submitVerificationByOpenid('o-a', 'identity', [], db))
      .toEqual({ error: 'invalid materials' });
    expect(await submitVerificationByOpenid('o-a', 'identity', ['a', 'b', 'c', 'd'], db))
      .toEqual({ error: 'invalid materials' });
    expect(await submitVerificationByOpenid('o-a', 'identity', 'cloud://a', db))
      .toEqual({ error: 'invalid materials' });
  });

  test('首次提交：pending 落库（userId/openid/type/材料/时间戳/reviewedBy 空）', async () => {
    const db = seed();
    const res = await submitVerificationByOpenid('o-a', 'identity', ['cloud://id1.jpg', 'cloud://id2.jpg'], db);
    expect(res).toEqual({ status: 'pending' });
    const docs = await db.collection('verifications').where({ userId: 'uA' }).get();
    expect(docs.data).toHaveLength(1);
    expect(docs.data[0]).toMatchObject({
      userId: 'uA', openid: 'o-a', type: 'identity',
      materialFileIDs: ['cloud://id1.jpg', 'cloud://id2.jpg'],
      status: 'pending', reviewedBy: null, reviewedAt: null,
    });
    expect(docs.data[0].createdAt).toBeTruthy();
  });

  test('状态机：pending/approved 重复提交幂等 unchanged；rejected 重新提交复用同文档置 pending', async () => {
    const db = seed();
    await submitVerificationByOpenid('o-a', 'education', ['cloud://e1'], db);
    const again = await submitVerificationByOpenid('o-a', 'education', ['cloud://e1'], db);
    expect(again).toEqual({ status: 'pending', unchanged: true });
    // 直接置 approved（管理员路径在 admin 函数内，此处只验证幂等语义）
    const doc = (await db.collection('verifications').where({ userId: 'uA' }).get()).data[0];
    await db.collection('verifications').doc(doc._id).update({
      data: { status: 'approved', reviewedBy: 'o-admin', reviewedAt: '2026-08-21T00:00:00Z' },
    });
    const approvedAgain = await submitVerificationByOpenid('o-a', 'education', ['cloud://e1'], db);
    expect(approvedAgain).toEqual({ status: 'approved', unchanged: true });
    // rejected → 重新提交：复用同文档、材料更新、置回 pending
    await db.collection('verifications').doc(doc._id).update({ data: { status: 'rejected' } });
    const resubmit = await submitVerificationByOpenid('o-a', 'education', ['cloud://e2'], db);
    expect(resubmit).toEqual({ status: 'pending' });
    const after = await db.collection('verifications').where({ userId: 'uA' }).get();
    expect(after.data).toHaveLength(1);
    expect(after.data[0].materialFileIDs).toEqual(['cloud://e2']);
    expect(after.data[0].status).toBe('pending');
  });
});

describe('cloudfunctions/getMyVerifications', () => {
  test('游客 → login required', async () => {
    expect(await getMyVerificationsByOpenid('o-x', seed())).toEqual({ error: 'login required' });
  });

  test('三类固定顺序返回：未提交 none；已提交带状态/材料/时间', async () => {
    const db = seed();
    await submitVerificationByOpenid('o-a', 'career', ['cloud://c1'], db);
    const res = await getMyVerificationsByOpenid('o-a', db);
    expect(res.list.map((v) => v.type)).toEqual(['identity', 'education', 'career']);
    expect(res.list[0]).toEqual({
      type: 'identity', status: 'none', materialFileIDs: [], createdAt: null, updatedAt: null, reviewedAt: null,
    });
    expect(res.list[2]).toMatchObject({
      type: 'career', status: 'pending', materialFileIDs: ['cloud://c1'],
    });
    expect(res.list[2].createdAt).toBeTruthy();
  });
});
