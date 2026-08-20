// tests/integration/report.test.js —— 举报提交（reports 落库，P4 处理）
const { createMockDb } = require('../helpers/mock-db.js');
const { reportByOpenid } = require('../../cloudfunctions/report/index.js');

function seed() {
  return createMockDb({
    users: { uA: { _id: 'uA', openid: 'o-a', role: 'normal', guestNo: 'J0001' } },
    profiles: {
      pB: { _id: 'pB', openid: 'o-b', basicInit: true, basic: {}, about: {}, createdAt: '2026-08-01T00:00:00Z' },
    },
    reports: {},
  });
}

describe('cloudfunctions/report', () => {
  test('游客 → login required；目标不存在 → not found', async () => {
    const db = seed();
    expect(await reportByOpenid('o-x', { targetId: 'pB', type: '诈骗行为', description: 'x' }, db))
      .toEqual({ error: 'login required' });
    expect(await reportByOpenid('o-a', { targetId: 'p-nope', type: '诈骗行为', description: 'x' }, db))
      .toEqual({ error: 'not found' });
  });

  test('字段校验：type 枚举 / description 必填 ≤200 / 截图 ≤3 张 fileID', async () => {
    const db = seed();
    expect(await reportByOpenid('o-a', { targetId: 'pB', type: '垃圾信息', description: 'x' }, db))
      .toEqual({ error: 'invalid type' });
    expect(await reportByOpenid('o-a', { targetId: 'pB', type: '诈骗行为', description: '' }, db))
      .toEqual({ error: 'invalid description' });
    expect(await reportByOpenid('o-a', { targetId: 'pB', type: '诈骗行为', description: 'x', screenshotFileIDs: ['a', 'b', 'c', 'd'] }, db))
      .toEqual({ error: 'invalid screenshots' });
    expect(await reportByOpenid('o-a', { targetId: 'pB', type: '诈骗行为', description: 'x', screenshotFileIDs: 'cloud://a' }, db))
      .toEqual({ error: 'invalid screenshots' });
  });

  test('合法提交：reports 落 pending + status/时间戳', async () => {
    const db = seed();
    const res = await reportByOpenid('o-a', {
      targetId: 'pB', type: '虚假资料', description: '照片与本人不符',
      screenshotFileIDs: ['cloud://s1.jpg'],
    }, db);
    expect(res).toEqual({ reported: true });
    const docs = await db.collection('reports').where({ reporterOpenid: 'o-a' }).get();
    expect(docs.data).toHaveLength(1);
    expect(docs.data[0]).toMatchObject({
      targetId: 'pB', targetOpenid: 'o-b', type: '虚假资料',
      description: '照片与本人不符', screenshotFileIDs: ['cloud://s1.jpg'], status: 'pending',
    });
    expect(docs.data[0].createdAt).toBeTruthy();
  });
});
