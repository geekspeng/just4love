// components/profile-card/index.js —— 完整资料卡组件（纯展示 + Task 12 的语音/照片交互）
const { formatAge } = require('../../utils/format.js');

const TAG_TITLES = {
  hobby: '爱好', personality: '性格', food: '喜欢的食物', media: '喜欢的影视',
};

// profile → 展示视图（纯函数，便于维护）
function buildDisplay(p) {
  const basic = p.basic || {};
  const about = p.about || {};
  const rows = [];
  const push = (label, value) => {
    if (value !== '' && value !== null && value !== undefined) rows.push({ label, value: String(value) });
  };
  const nameParts = [];
  if (basic.nickname) nameParts.push(basic.gender ? basic.nickname + '(' + basic.gender + ')' : basic.nickname);
  if (about.emotionalStatus) nameParts.push(about.emotionalStatus);
  push('昵称', nameParts.join(' · '));
  if (basic.birthday) push('年龄', formatAge(Number(basic.birthday.slice(0, 4))));
  push('身高', about.height ? about.height + 'cm' : '');
  push('体重', about.weight ? about.weight + 'kg' : '');
  push('星座', basic.constellation);
  push('家乡', about.hometown);
  push('现居地', about.city);
  push('学校学历', [about.school, about.education].filter(Boolean).join(' · '));
  push('职业', about.job);
  const habits = [];
  if (about.smoke) habits.push(about.smoke + '吸烟');
  if (about.drink) habits.push(about.drink + '喝酒');
  if (about.gamble) habits.push(about.gamble + '打牌');
  push('生活习惯', habits.join(' · '));
  push('恋爱目标', about.loveGoal);

  const tags = p.tags || {};
  const tagGroups = Object.keys(TAG_TITLES)
    .filter((k) => (tags[k] || []).length > 0)
    .map((k) => ({ title: TAG_TITLES[k], items: tags[k] }));

  return {
    infoRows: rows,
    tagGroups,
    familyText: (about.familyBackground || []).join('、'),
    albumList: p.album || [],
    storyList: p.stories || [],
  };
}

Component({
  properties: {
    profile: { type: Object, value: {} },
    showActions: { type: Boolean, value: false },
    verified: { type: Boolean, value: false },
  },
  data: {
    infoRows: [],
    tagGroups: [],
    familyText: '',
    albumList: [],
    storyList: [],
    playingIndex: -1,
  },
  observers: {
    profile(p) {
      if (!p) return;
      this.setData(buildDisplay(p));
    },
  },
  lifetimes: {
    detached() {
      if (this._audio) {
        this._audio.destroy();
        this._audio = null;
      }
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { profile: this.data.profile });
    },
    onLike() {
      this.triggerEvent('like', { profile: this.data.profile });
    },
    onPass() {
      this.triggerEvent('pass', { profile: this.data.profile });
    },

    onPlayStory(e) {
      const idx = Number(e.currentTarget.dataset.index);
      const story = this.data.storyList[idx];
      if (!story || !story.audioFileID) return;
      if (typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') return;
      if (!this._audio) this._audio = wx.createInnerAudioContext();
      if (this.data.playingIndex === idx) {
        this._audio.stop();
        this.setData({ playingIndex: -1 });
        return;
      }
      if (this.data.playingIndex !== -1) {
        this._audio.stop();
      }
      this._audio.src = story.audioFileID;
      this._audio.play();
      this.setData({ playingIndex: idx });
    },

    onPreviewAlbum(e) {
      const idx = Number(e.currentTarget.dataset.index);
      const urls = this.data.albumList.map((a) => a.fileID);
      if (typeof wx !== 'undefined' && wx.previewImage) {
        wx.previewImage({ current: urls[idx], urls });
      }
    },
  },
});
