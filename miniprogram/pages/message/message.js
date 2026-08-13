// pages/message/message.js —— 【消息】tab（聊天会话列表）
Page({
  data: {
    sessions: [
      {
        id: 's_demo_1',
        nickname: '小鱼',
        lastMessage: '你好，很高兴认识你～',
        avatar: '',
        unread: 1,
      },
    ],
  },

  onTapSession(e) {
    const { id } = e.currentTarget.dataset;
    wx.showToast({ title: `打开会话 ${id}`, icon: 'none' });
  },
});
