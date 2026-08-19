// tests/integration/setupDb.test.js —— setupDb 配额种子（幂等）
const { createMockDb } = require('../helpers/mock-db.js');
const { seedQuotaConfig } = require('../../cloudfunctions/setupDb/index.js');

describe('cloudfunctions/setupDb seedQuotaConfig', () => {
  test('config 无文档时写入默认配额，再次执行不覆盖', async () => {
    const db = createMockDb();
    expect(await seedQuotaConfig(db)).toBe('created');
    const doc = await db.collection('config').doc('quotas').get();
    expect(doc.data.normal).toBe(5);
    expect(doc.data.verified).toBe(15);
    // 控制台改过（如 normal→9）后再跑 setupDb 不覆盖
    await db.collection('config').doc('quotas').set({ data: { normal: 9, verified: 15 } });
    expect(await seedQuotaConfig(db)).toBe('exists');
    const after = await db.collection('config').doc('quotas').get();
    expect(after.data.normal).toBe(9);
  });
});
