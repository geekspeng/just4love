// tests/unit/profile-card.test.js —— profile-card 组件单测（完整信息区）
const simulate = require('miniprogram-simulate');
const path = require('path');

const FULL = {
  basic: {
    guestNo: 'J0001', nickname: '小鱼', gender: '女', birthday: '1995-06-15',
    constellation: '双子座', avatarFileID: 'cloud://a.jpg', signature: '认真生活',
  },
  about: {
    aboutMe: '喜欢旅行和美食', aboutYou: '希望你成熟稳重', loveGoal: '先认真谈场恋爱再说',
    emotionalStatus: '单身未婚', height: 165, education: '本科', job: '互联网/IT',
    city: '广东省 深圳市', hometown: '湖南省 长沙市', school: '湖南大学',
    familyBackground: ['独生子女', '父母有退休金'], smoke: '从不', drink: '偶尔', gamble: '从不',
  },
  tags: { hobby: ['旅行', '美食'], personality: ['开朗'], food: [], media: [] },
  album: [],
  stories: [],
};

describe('components/profile-card', () => {
  let id;

  beforeAll(() => {
    id = simulate.load(path.resolve(__dirname, '../../miniprogram/components/profile-card/index'));
  });

  function render(props) {
    const comp = simulate.render(id, props);
    comp.attach(document.createElement('parent-wrapper'));
    return comp;
  }

  test('头部渲染嘉宾编号、实名标识、签名', () => {
    const comp = render({ profile: FULL, verified: false });
    const head = comp.querySelector('.pc__head');
    expect(head.dom.textContent).toContain('J0001');
    expect(head.dom.textContent).toContain('未实名');
    expect(head.dom.textContent).toContain('认真生活');
    comp.detach();
  });

  test('信息行渲染昵称(性别)·情感状态、年龄身高星座等（空值行不出现）', () => {
    const comp = render({ profile: FULL });
    const rows = comp.querySelector('.pc__rows');
    const text = rows.dom.textContent;
    expect(text).toContain('小鱼(女) · 单身未婚');
    expect(text).toContain('165cm');
    expect(text).toContain('双子座');
    expect(text).toContain('广东省 深圳市');
    expect(text).toContain('湖南大学 · 本科');
    expect(text).toContain('偶尔喝酒');
    expect(text).toContain('先认真谈场恋爱再说');
    comp.detach();
  });

  test('关于我/希望你/标签/家庭背景区块渲染', () => {
    const comp = render({ profile: FULL });
    const html = comp.dom.innerHTML;
    expect(html).toContain('关于我');
    expect(html).toContain('喜欢旅行和美食');
    expect(html).toContain('希望你');
    expect(html).toContain('独生子女、父母有退休金');
    expect(html).toContain('爱好');
    expect(html).toContain('旅行');
    comp.detach();
  });

  test('稀疏资料：空区块整体隐藏，信息行无空值', () => {
    const comp = render({ profile: { basic: { guestNo: 'J0002', nickname: '小明' }, about: {}, tags: {} } });
    const html = comp.dom.innerHTML;
    expect(html).not.toContain('关于我');
    expect(html).not.toContain('我的标签');
    expect(html).not.toContain('家庭背景');
    const rows = comp.querySelector('.pc__rows');
    expect(rows.dom.textContent).toContain('小明');
    expect(rows.dom.textContent).not.toContain('undefined');
    expect(rows.dom.textContent).not.toContain('null');
    comp.detach();
  });

  test('showActions=true 时渲染无感/心动按钮并触发事件', () => {
    const comp = render({ profile: FULL, showActions: true });
    const spy = jest.fn();
    comp.instance.triggerEvent = spy;
    comp.instance.onLike();
    expect(spy).toHaveBeenCalledWith('like', { profile: FULL });
    comp.detach();
  });
});