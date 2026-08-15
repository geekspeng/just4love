// tests/unit/profile.test.js —— 空资料模板与草稿校验
const { createEmptyProfile, validateProfileDraft } = require('../../miniprogram/utils/profile.js');

describe('utils/profile', () => {
  test('空模板结构与契约一致', () => {
    const p = createEmptyProfile({ userId: 'u1', guestNo: 'J0007', openid: 'ox' });
    expect(p.userId).toBe('u1');
    expect(p.openid).toBe('ox');
    expect(p.basicInit).toBe(false);
    expect(p.basic.guestNo).toBe('J0007');
    expect(p.about.height).toBeNull();
    expect(p.about.familyBackground).toEqual([]);
    expect(p.privacy.asset).toEqual({ house: '', car: '', income: '' });
    expect(p.album).toEqual([]);
    expect(p.stories).toEqual([]);
    expect(p.tags).toEqual({ hobby: [], personality: [], food: [], media: [] });
  });

  test('user 为 null 时给出安全默认值', () => {
    const p = createEmptyProfile(null);
    expect(p.userId).toBe('');
    expect(p.basic.guestNo).toBe('');
  });

  test('两次调用不共享引用（深结构各自独立）', () => {
    const a = createEmptyProfile(null);
    const b = createEmptyProfile(null);
    a.about.familyBackground.push('独生子女');
    a.tags.hobby.push('旅行');
    expect(b.about.familyBackground).toEqual([]);
    expect(b.tags.hobby).toEqual([]);
  });

  test('未初始化基本资料时：昵称/性别/生日缺一不可', () => {
    const p = createEmptyProfile(null);
    expect(validateProfileDraft(p).ok).toBe(false);
    p.basic.nickname = '小鱼';
    expect(validateProfileDraft(p).message).toBe('请选择性别');
    p.basic.gender = '女';
    expect(validateProfileDraft(p).message).toBe('请选择生日');
    p.basic.birthday = '1995-06-15';
    expect(validateProfileDraft(p).ok).toBe(true);
  });

  test('已初始化（basicInit）时允许其余字段为空直接保存', () => {
    const p = createEmptyProfile(null);
    p.basicInit = true;
    const r = validateProfileDraft(p);
    expect(r.ok).toBe(true);
  });

  test('昵称纯空白视为未填写', () => {
    const p = createEmptyProfile(null);
    p.basic.nickname = '   ';
    expect(validateProfileDraft(p).message).toBe('请填写昵称');
  });
});
