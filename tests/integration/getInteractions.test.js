// tests/integration/getInteractions.test.js —— 谁看过我 / 喜欢我的
const { createMockDb } = require('../helpers/mock-db.js');
const { getInteractionsByOpenid } = require('../../cloudfunctions/getInteractions/index.js');

function seed() {
  return createMockDb({
    users: {
      uMe: { _id: 'uMe', openid: 'o-me', role: 'normal', guestNo: 'J0001' },
      uA: { _id: 'uA', openid: 'o-a', role: 'verified', guestNo: 'J0002' },
      uB: { _id: 'uB', openid: 'o-b', role: 'normal', guestNo: 'J0003' },
      uC: { _id: 'uC', openid: 'o-c', role: 'normal', guestNo: 'J0004' }, // 无资料
    },
    profiles: {
      pMe: { _id: 'pMe', openid: 'o-me', basicInit: true, basic: { guestNo: 'J0001', nickname: '我' }, about: {}, createdAt: '2026-08-01T00:00:00Z' },
      pA: { _id: 'pA', openid: 'o-a', basicInit: true, basic: { guestNo: 'J0002', nickname: '小甲', avatarFileID: 'cloud://a.jpg' }, about: {}, createdAt: '2026-08-02T00:00:00Z' },
      pB: { _id: 'pB', openid: 'o-b', basicInit: true, basic: { guestNo: 'J0003', nickname: '小乙' }, about: {}, createdAt: '2026-08-03T00:00:00Z' },
    },
    view_logs: {
      v1: { _id: 'v1', viewerOpenid: 'o-a', viewerId: 'uA', targetId: 'pMe', targetOpenid: 'o-me', dateKey: '2026-08-20', createdAt: '2026-08-20T01:00:00Z' },
      v2: { _id: 'v2', viewerOpenid: 'o-a', viewerId: 'uA', targetId: 'pMe', targetOpenid: 'o-me', dateKey: '2026-08-19', createdAt: '2026-08-19T01:00:00Z' }, // 同人再看
      v3: { _id: 'v3', viewerOpenid: 'o-c', viewerId: 'uC', targetId: 'pMe', targetOpenid: 'o-me', dateKey: '2026-08-20', createdAt: '2026-08-20T02:00:00Z' }, // 无资料
    },
    interactions: {
      iA: { _id: 'iA', fromOpenid: 'o-a', fromUserId: 'uA', targetId: 'pMe', targetOpenid: 'o-me', type: 'like', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' },
      iB: { _id: 'iB', fromOpenid: 'o-b', fromUserId: 'uB', targetId: 'pMe', targetOpenid: 'o-me', type: 'like', createdAt: '2026-08-20T03:00:00Z', updatedAt: '2026-08-20T03:00:00Z' },
      iMeA: { _id: 'iMeA', fromOpenid: 'o-me', fromUserId: 'uMe', targetId: 'pA', targetOpenid: 'o-a', type: 'like', createdAt: '2026-08-20T04:00:00Z', updatedAt: '2026-08-20T04:00:00Z' }, // 我也喜欢小甲 → matched
    },
  });
}

describe('cloudfunctions/getInteractions', () => {
  test('游客/非法 type → error', async () => {
    const db = seed();
    expect(await getInteractionsByOpenid('o-x', 'view', db)).toEqual({ error: 'login required' });
    expect(await getInteractionsByOpenid('o-me', 'wave', db)).toEqual({ error: 'invalid type' });
  });

  test('谁看过我：按 viewer 去重保最新、join 资料快照、无资料者剔除、verified 标记', async () => {
    const db = seed();
    const res = await getInteractionsByOpenid('o-me', 'view', db);
    expect(res.type).toBe('view');
    expect(res.list).toHaveLength(1); // o-a 去重、o-c 无资料剔除
    expect(res.list[0]).toEqual({
      profileId: 'pA', nickname: '小甲', avatarFileID: 'cloud://a.jpg',
      guestNo: 'J0002', verified: true, matched: false,
      at: '2026-08-20T01:00:00Z', // 最新一次
    });
  });

  test('喜欢我的：matched 标记（我也喜欢对方）；无感的不出现', async () => {
    const db = seed();
    await db.collection('interactions').doc('iB').update({ data: { type: 'pass' } });
    const res = await getInteractionsByOpenid('o-me', 'like', db);
    expect(res.list).toHaveLength(1); // 小乙改无感后剔除
    expect(res.list[0].nickname).toBe('小甲');
    expect(res.list[0].matched).toBe(true);
  });
});
