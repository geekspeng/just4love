// pages/recommend/recommend.js —— 【推荐】tab（P2 改造为「遇见」列表，此处仍为 mock）
const mockProfiles = [
  {
    basic: { guestNo: 'J0001', nickname: '小鱼', gender: '女', birthday: '1995-06-15', constellation: '双子座', avatarFileID: '', signature: '喜欢旅行' },
    about: { height: 165, emotionalStatus: '单身未婚', job: '互联网/IT', city: '广东省 深圳市' },
    tags: { hobby: ['旅行'] },
  },
  {
    basic: { guestNo: 'J0002', nickname: '大刘', gender: '男', birthday: '1990-03-08', constellation: '双鱼座', avatarFileID: '', signature: '互联网从业' },
    about: { height: 178, emotionalStatus: '单身未婚', job: '互联网/IT', city: '广东省 深圳市' },
    tags: { hobby: ['游戏'] },
  },
];

Page({
  data: {
    list: mockProfiles,
  },

  onLoad() {
    // P2：调用 request.callFunction('listProfiles') 拉取真实列表
  },

  onLike(e) {
    const { profile } = e.detail;
    wx.showToast({ title: `心动了 ${profile.basic.nickname}`, icon: 'none' });
  },

  onPass(e) {
    const { profile } = e.detail;
    wx.showToast({ title: `已无感 ${profile.basic.nickname}`, icon: 'none' });
  },
});
