// tests/unit/options.test.js —— 选项池常量结构与数量守卫（防手滑改错）
const o = require('../../miniprogram/utils/options.js');

describe('utils/options', () => {
  test('恋爱目标为规格中的 4 个选项', () => {
    expect(o.LOVE_GOALS).toEqual([
      '短期内想结婚',
      '认真谈场恋爱如果合适可以考虑结婚',
      '先认真谈场恋爱再说',
      '没考虑清楚',
    ]);
  });

  test('家庭背景 12 项、含规格列举的关键项', () => {
    expect(o.FAMILY_BACKGROUND).toHaveLength(12);
    ['独生子女', '拆二代', '单亲或离异', '父母有退休金'].forEach((x) =>
      expect(o.FAMILY_BACKGROUND).toContain(x)
    );
  });

  test('生活习惯/学历/职业选项非空', () => {
    expect(o.HABITS).toEqual(['从不', '偶尔', '经常']);
    expect(o.EDUCATIONS).toHaveLength(5);
    expect(o.JOBS.length).toBeGreaterThanOrEqual(10);
  });

  test('房产/车辆/收入选项与规格一致', () => {
    expect(o.HOUSE).toEqual(['与家人同住', '有房无贷', '有房有贷', '租房暂无房']);
    expect(o.CAR).toEqual(['有车', '暂无']);
    expect(o.INCOME).toEqual(['10万以下', '10-20万', '20-30万', '30-50万', '50-100万', '100万以上']);
  });

  test('相册 5 分类与规格一致', () => {
    expect(o.ALBUM_CATEGORIES).toEqual([
      '日常生活', '兴趣爱好', '旅行经历', '家有萌宠', '健身运动',
    ]);
  });

  test('标签池 4 类、每类非空且无重复项', () => {
    expect(Object.keys(o.TAG_POOLS)).toEqual(['hobby', 'personality', 'food', 'media']);
    Object.values(o.TAG_POOLS).forEach((pool) => {
      expect(pool.length).toBeGreaterThanOrEqual(6);
      expect(new Set(pool).size).toBe(pool.length);
    });
  });

  test('故事话题池 ≥10 且 LIMITS 数量守卫', () => {
    expect(o.STORY_TOPICS.length).toBeGreaterThanOrEqual(10);
    expect(o.LIMITS).toEqual({
      ALBUM_MAX: 5, STORIES_MAX: 5, TAGS_PER_CATEGORY_MAX: 5, FAMILY_MAX: 12,
    });
  });

  test('REPORT_TYPES 举报选项池（与云函数 report 字面量同步）', () => {
    expect(o.REPORT_TYPES).toEqual(['虚假资料', '诈骗行为', '骚扰', '色情低俗', '其他']);
  });
});
