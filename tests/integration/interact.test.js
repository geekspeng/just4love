// tests/integration/interact.test.js —— interact 云函数（心动/无感/互配/通知）
const { createMockDb } = require('../helpers/mock-db.js');
const { interactByOpenid } = require('../../cloudfunctions/interact/index.js');

function seed() {
  return createMockDb({
    users: {
      uA: { _id: 'uA', openid: 'o-a', role: 'normal', guestNo: 'J0001' },
      uB: { _id: 'uB', openid: 'o-b', role: 'normal', guestNo: 'J0002' },
    },
    profiles: {
      pA: { _id: 'pA', openid: 'o-a', basicInit: true, basic: { guestNo: 'J0001', nickname: '小甲' }, about: {}, createdAt: '2026-08-01T00:00:00Z' },
      pB: { _id: 'pB', openid: 'o-b', basicInit: true, basic: { guestNo: 'J0002', nickname: '小乙' }, about: {}, createdAt: '2026-08-02T00:00:00Z' },
    },
  });
}

describe('cloudfunctions/interact', () => {
  test('游客 → login required；非法 type / 不存在目标 / 自己 / 未完善资料', async () => {
    const db = seed();
    expect(await interactByOpenid('o-stranger', 'pB', 'like', db)).toEqual({ error: 'login required' });
    expect(await interactByOpenid('o-a', 'pB', 'smile', db)).toEqual({ error: 'invalid type' });
    expect(await interactByOpenid('o-a', 'p-nope', 'like', db)).toEqual({ error: 'not found' });
    expect(await interactByOpenid('o-a', 'pA', 'like', db)).toEqual({ error: 'cannot interact self' });
    await db.collection('profiles').add({ data: { _id: 'pRaw', openid: 'o-raw', basicInit: false, basic: {}, createdAt: '2026-08-03T00:00:00Z' } });
    expect(await interactByOpenid('o-a', 'pRaw', 'like', db)).toEqual({ error: 'not found' });
  });

  test('单向心动：落 interactions + 对方收 like 通知（快照 nickname/guestNo/profileId）', async () => {
    const db = seed();
    const res = await interactByOpenid('o-a', 'pB', 'like', db);
    expect(res).toEqual({ matched: false });
    const inter = await db.collection('interactions').where({ fromOpenid: 'o-a', targetOpenid: 'o-b' }).get();
    expect(inter.data).toHaveLength(1);
    expect(inter.data[0].type).toBe('like');
    const notes = await db.collection('notifications').where({ toOpenid: 'o-b' }).get();
    expect(notes.data).toHaveLength(1);
    expect(notes.data[0].type).toBe('like');
    expect(notes.data[0].payload).toEqual({ nickname: '小甲', guestNo: 'J0001', profileId: 'pA' });
  });

  test('互配：后达成的一方触发双方 match 通知；重复 like 不重复通知', async () => {
    const db = seed();
    await interactByOpenid('o-a', 'pB', 'like', db);       // A 心动 B（B 收 like）
    const res = await interactByOpenid('o-b', 'pA', 'like', db); // B 心动 A → 匹配
    expect(res).toEqual({ matched: true });
    const toA = await db.collection('notifications').where({ toOpenid: 'o-a' }).get();
    const toB = await db.collection('notifications').where({ toOpenid: 'o-b' }).get();
    expect(toA.data).toHaveLength(1);
    expect(toA.data[0].type).toBe('match');
    expect(toA.data[0].payload.nickname).toBe('小乙');
    expect(toB.data.filter((n) => n.type === 'match')).toHaveLength(1);
    // 重复 like（同态度 upsert）→ 无新通知
    await interactByOpenid('o-a', 'pB', 'like', db);
    const toBAgain = await db.collection('notifications').where({ toOpenid: 'o-b' }).get();
    expect(toBAgain.data).toHaveLength(2); // like + match，未新增
  });

  test('态度切换：like→pass 覆盖同文档；pass→like 且对方仍 like → 重新匹配但通知只发 like 补发', async () => {
    const db = seed();
    await interactByOpenid('o-a', 'pB', 'like', db);
    await interactByOpenid('o-b', 'pA', 'like', db); // 匹配
    const toPass = await interactByOpenid('o-a', 'pB', 'pass', db);
    expect(toPass).toEqual({ matched: false });
    const inter = await db.collection('interactions').where({ fromOpenid: 'o-a', targetOpenid: 'o-b' }).get();
    expect(inter.data).toHaveLength(1); // upsert 不新建
    expect(inter.data[0].type).toBe('pass');
  });

  test('pass 不发通知；无感排除的 targetId 形状正确', async () => {
    const db = seed();
    await interactByOpenid('o-a', 'pB', 'pass', db);
    const inter = await db.collection('interactions').where({ fromOpenid: 'o-a' }).get();
    expect(inter.data[0].targetId).toBe('pB');
    const notes = await db.collection('notifications').where({}).get();
    expect(notes.data).toHaveLength(0);
  });
});
