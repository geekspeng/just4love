// tests/integration/notifications.test.js —— 通知读取与已读标记
const { createMockDb } = require('../helpers/mock-db.js');
const { getNotificationsByOpenid } = require('../../cloudfunctions/getNotifications/index.js');
const { markReadByOpenid } = require('../../cloudfunctions/markRead/index.js');

function seed() {
  return createMockDb({
    users: { uA: { _id: 'uA', openid: 'o-a', role: 'normal', guestNo: 'J0001' } },
    notifications: {
      n1: { _id: 'n1', toOpenid: 'o-a', type: 'like', payload: { nickname: '小乙' }, read: false, createdAt: '2026-08-20T01:00:00Z' },
      n2: { _id: 'n2', toOpenid: 'o-a', type: 'match', payload: { nickname: '小丙' }, read: false, createdAt: '2026-08-20T02:00:00Z' },
      n3: { _id: 'n3', toOpenid: 'o-a', type: 'view', payload: { nickname: '小丁' }, read: true, createdAt: '2026-08-20T03:00:00Z' },
      n4: { _id: 'n4', toOpenid: 'o-b', type: 'like', payload: {}, read: false, createdAt: '2026-08-20T04:00:00Z' },
    },
  });
}

describe('cloudfunctions/notifications', () => {
  test('游客 → login required（两函数）', async () => {
    const db = seed();
    expect(await getNotificationsByOpenid('o-x', db)).toEqual({ error: 'login required' });
    expect(await markReadByOpenid('o-x', ['n1'], false, db)).toEqual({ error: 'login required' });
  });

  test('列表倒序 50 条 + unread 计数', async () => {
    const db = seed();
    const res = await getNotificationsByOpenid('o-a', db);
    expect(res.list.map((n) => n._id)).toEqual(['n3', 'n2', 'n1']); // createdAt 倒序
    expect(res.unread).toBe(2);
  });

  test('markRead 按 ids：仅自己名下且未读的生效；已读重复标记不计数', async () => {
    const db = seed();
    const res = await markReadByOpenid('o-a', ['n1', 'n3', 'n4'], false, db); // n3 已读、n4 他人
    expect(res).toEqual({ updated: 1 });
    const after = await db.collection('notifications').doc('n1').get();
    expect(after.data.read).toBe(true);
    const again = await markReadByOpenid('o-a', ['n1'], false, db);
    expect(again).toEqual({ updated: 0 });
  });

  test('markRead all=true：全部未读置已读', async () => {
    const db = seed();
    const res = await markReadByOpenid('o-a', null, true, db);
    expect(res).toEqual({ updated: 2 });
    const list = await getNotificationsByOpenid('o-a', db);
    expect(list.unread).toBe(0);
  });

  test('空入参 → updated 0（不报错）', async () => {
    const res = await markReadByOpenid('o-a', [], false, seed());
    expect(res).toEqual({ updated: 0 });
  });
});
