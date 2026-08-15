// profile-card 组件单测 —— 用 miniprogram-simulate 在 Node 下渲染组件（重命名自 recommend-card）
const simulate = require('miniprogram-simulate');
const path = require('path');

describe('components/profile-card', () => {
  let id;

  beforeAll(() => {
    // load 载入组件，返回组件 id；用绝对路径定位
    id = simulate.load(
      path.resolve(__dirname, '../../miniprogram/components/profile-card/index')
    );
  });

  test('渲染昵称与格式化后的年龄/身高', () => {
    const comp = simulate.render(id, {
      user: { nickname: '小鱼', age: 1995, height: 165, tag: '喜欢旅行' },
    });
    const parent = document.createElement('parent-wrapper');
    comp.attach(parent);

    const nameEl = comp.querySelector('.rc__name');
    const metaEl = comp.querySelector('.rc__meta');
    const tagEl = comp.querySelector('.rc__tag');

    expect(nameEl.dom.textContent).toContain('小鱼');
    // formatAge(1995) => "N岁"，formatHeight(165) => "165cm"
    expect(metaEl.dom.textContent).toContain('165cm');
    expect(metaEl.dom.textContent).toMatch(/\d+岁/);
    expect(tagEl.dom.textContent).toContain('喜欢旅行');

    comp.detach();
  });

  test('缺少身高时只显示年龄', () => {
    const comp = simulate.render(id, {
      user: { nickname: '匿名', age: 1990 },
    });
    comp.attach(document.createElement('parent-wrapper'));

    const metaEl = comp.querySelector('.rc__meta');
    expect(metaEl.dom.textContent).toMatch(/\d+岁/);
    expect(metaEl.dom.textContent).not.toContain('cm');

    comp.detach();
  });

  test('点击「心动」触发 like 事件', () => {
    const comp = simulate.render(id, {
      user: { nickname: '测试', age: 1995, height: 170 },
    });
    comp.attach(document.createElement('parent-wrapper'));

    // 直接调用组件实例方法并 spy triggerEvent
    const spy = jest.fn();
    comp.instance.triggerEvent = spy;
    comp.instance.onLike();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('like', {
      user: { nickname: '测试', age: 1995, height: 170 },
    });

    comp.detach();
  });

  test('点击「跳过」触发 pass 事件', () => {
    const comp = simulate.render(id, {
      user: { nickname: '测试', age: 1995, height: 170 },
    });
    comp.attach(document.createElement('parent-wrapper'));

    const spy = jest.fn();
    comp.instance.triggerEvent = spy;
    comp.instance.onPass();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('pass', {
      user: { nickname: '测试', age: 1995, height: 170 },
    });

    comp.detach();
  });
});
