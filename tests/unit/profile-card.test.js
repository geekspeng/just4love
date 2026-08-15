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

let id;

beforeAll(() => {
  id = simulate.load(path.resolve(__dirname, '../../miniprogram/components/profile-card/index'));
});

describe('components/profile-card', () => {
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

// File-level render helper for both describe blocks
function render(props) {
  const comp = simulate.render(id, props);
  comp.attach(document.createElement('parent-wrapper'));
  return comp;
}

describe('components/profile-card 相册与故事', () => {
  const withMedia = {
    basic: { guestNo: 'J0001', nickname: '小鱼' },
    about: {},
    album: [
      { category: '日常生活', fileID: 'cloud://1.jpg' },
      { category: '旅行经历', fileID: 'cloud://2.jpg' },
    ],
    stories: [
      { topic: '我的周末', audioFileID: 'cloud://s1.mp3' },
      { topic: '我的爱好', audioFileID: 'cloud://s2.mp3' },
    ],
  };

  beforeEach(() => {
    wx.createInnerAudioContext.mockClear();
    wx.previewImage.mockClear();
  });

  test('相册渲染分类与图片，点击预览', () => {
    const comp = render({ profile: withMedia });
    const album = comp.querySelector('.pc__album');
    expect(album.dom.textContent).toContain('日常生活');
    expect(album.dom.textContent).toContain('旅行经历');
    comp.instance.onPreviewAlbum({ currentTarget: { dataset: { index: 0 } } });
    expect(wx.previewImage).toHaveBeenCalledWith({
      current: 'cloud://1.jpg',
      urls: ['cloud://1.jpg', 'cloud://2.jpg'],
    });
    comp.detach();
  });

  test('头部渲染「播放语音介绍」，点击播放第一条故事', () => {
    const audio = { src: '', play: jest.fn(), stop: jest.fn(), destroy: jest.fn() };
    wx.createInnerAudioContext.mockReturnValueOnce(audio);
    const comp = render({ profile: withMedia });
    const head = comp.querySelector('.pc__head');
    expect(head.dom.textContent).toContain('播放语音介绍');
    comp.instance.onPlayStory({ currentTarget: { dataset: { index: 0 } } });
    expect(audio.src).toBe('cloud://s1.mp3');
    expect(comp.data.playingIndex).toBe(0);
    comp.detach();
  });

  test('故事区渲染话题；点播放创建音频并播第一条，再点同一条停止', () => {
    const audio = { src: '', play: jest.fn(), stop: jest.fn(), destroy: jest.fn() };
    wx.createInnerAudioContext.mockReturnValue(audio);
    const comp = render({ profile: withMedia });
    const stories = comp.querySelector('.pc__stories');
    expect(stories.dom.textContent).toContain('我的周末');

    comp.instance.onPlayStory({ currentTarget: { dataset: { index: 0 } } });
    expect(audio.src).toBe('cloud://s1.mp3');
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(comp.data.playingIndex).toBe(0);

    comp.instance.onPlayStory({ currentTarget: { dataset: { index: 0 } } });
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(comp.data.playingIndex).toBe(-1);
    comp.detach();
  });

  test('切换播放另一条时先停旧条', () => {
    const audio = { src: '', play: jest.fn(), stop: jest.fn(), destroy: jest.fn() };
    wx.createInnerAudioContext.mockReturnValue(audio);
    const comp = render({ profile: withMedia });
    comp.instance.onPlayStory({ currentTarget: { dataset: { index: 0 } } });
    comp.instance.onPlayStory({ currentTarget: { dataset: { index: 1 } } });
    expect(audio.stop).toHaveBeenCalled();
    expect(audio.src).toBe('cloud://s2.mp3');
    expect(comp.data.playingIndex).toBe(1);
    comp.detach(); // Triggers detached lifecycle
    expect(audio.destroy).toHaveBeenCalled();
  });
});