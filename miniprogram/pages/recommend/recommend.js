// pages/recommend/recommend.js —— 【推荐】tab
const mockUsers = [
  {
    id: 'u_demo_1',
    nickname: '小鱼',
    age: 1995,
    height: 165,
    avatar: '',
    tag: '喜欢旅行',
  },
  {
    id: 'u_demo_2',
    nickname: '大刘',
    age: 1990,
    height: 178,
    avatar: '',
    tag: '互联网从业',
  },
];

Page({
  data: {
    list: mockUsers,
  },

  onLoad() {
    // 后续在此调用 request.callFunction('getRecommend') 拉取真实推荐列表
  },

  onLike(e) {
    const { user } = e.detail;
    wx.showToast({ title: `心动了 ${user.nickname}`, icon: 'none' });
  },

  onPass(e) {
    const { user } = e.detail;
    wx.showToast({ title: `已跳过 ${user.nickname}`, icon: 'none' });
  },
});
