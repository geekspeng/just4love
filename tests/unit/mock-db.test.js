// tests/unit/mock-db.test.js —— mock-db 查询能力单测（Task 1 新增能力）
const { createMockDb } = require('../helpers/mock-db.js');

function seedDb() {
  return createMockDb({
    profiles: {
      p1: { _id: 'p1', openid: 'a', basicInit: true, createdAt: '2026-08-01T00:00:00Z',
            basic: { birthday: '1990-03-08' }, about: { height: 178, education: '本科', city: '广东省 深圳市' } },
      p2: { _id: 'p2', openid: 'b', basicInit: true, createdAt: '2026-08-03T00:00:00Z',
            basic: { birthday: '1995-06-15' }, about: { height: 165, education: '硕士', city: '北京市 朝阳区' } },
      p3: { _id: 'p3', openid: 'c', basicInit: false, createdAt: '2026-08-02T00:00:00Z',
            basic: { birthday: '1988-01-01' }, about: { height: 172, education: '本科', city: '广东省 深圳市' } },
    },
  });
}

describe('helpers/mock-db 查询扩展', () => {
  test('where 支持点路径等值查询', async () => {
    const db = seedDb();
    const res = await db.collection('profiles').where({ 'about.education': '本科' }).get();
    expect(res.data.map((d) => d._id).sort()).toEqual(['p1', 'p3']);
  });

  test('command: 数值范围 gte/lte（含链式 AND）', async () => {
    const db = seedDb();
    const _ = db.command;
    const res = await db.collection('profiles')
      .where({ 'about.height': _.gte(170).lte(180) }).get();
    expect(res.data.map((d) => d._id).sort()).toEqual(['p1', 'p3']);
  });

  test('command: 字符串范围（ISO 日期前缀比较）', async () => {
    const db = seedDb();
    const _ = db.command;
    const res = await db.collection('profiles')
      .where({ 'basic.birthday': _.gte('1989-01-01').lte('1994-12-31') }).get();
    expect(res.data.map((d) => d._id)).toEqual(['p1']);
  });

  test('command: in 多值命中 / neq 排除', async () => {
    const db = seedDb();
    const _ = db.command;
    const inRes = await db.collection('profiles').where({ 'about.education': _.in(['硕士', '博士']) }).get();
    expect(inRes.data.map((d) => d._id)).toEqual(['p2']);
    const neqRes = await db.collection('profiles').where({ openid: _.neq('a') }).get();
    expect(neqRes.data.map((d) => d._id).sort()).toEqual(['p2', 'p3']);
  });

  test('orderBy desc + skip + limit 分页', async () => {
    const db = seedDb();
    const page1 = await db.collection('profiles')
      .where({ basicInit: true }).orderBy('createdAt', 'desc').skip(0).limit(1).get();
    expect(page1.data.map((d) => d._id)).toEqual(['p2']);
    const page2 = await db.collection('profiles')
      .where({ basicInit: true }).orderBy('createdAt', 'desc').skip(1).limit(1).get();
    expect(page2.data.map((d) => d._id)).toEqual(['p1']);
  });

  test('limit+1 探测 hasMore 模式', async () => {
    const db = seedDb();
    // 全量 3 条、pageSize=2：limit(3) 取回 3 条 > 2 → hasMore
    const got = await db.collection('profiles')
      .where({}).orderBy('createdAt', 'desc').skip(0).limit(3).get();
    expect(got.data).toHaveLength(3);
    expect(got.data.length > 2).toBe(true); // hasMore 判定成立
  });

  test('get 返回深拷贝（改结果不影响库内文档）', async () => {
    const db = seedDb();
    const res = await db.collection('profiles').where({ _id: 'p1' }).get();
    res.data[0].about.height = 999;
    const again = await db.collection('profiles').where({ _id: 'p1' }).get();
    expect(again.data[0].about.height).toBe(178);
  });
});
