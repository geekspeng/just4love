// pages/story-edit/story-edit.js —— 5 个故事：话题 + 语音录制上传
const { callFunction } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { uploadAudio } = require('../../utils/upload.js');
const { STORY_TOPICS } = require('../../utils/options.js');

Page({
  data: {
    topics: STORY_TOPICS,
    stories: [],        // [{topic, audioFileID}]
    recordingIndex: -1, // 正在录音的槽位
    playingIndex: -1,
    userId: '',
  },

  async onLoad() {
    const user = await ensureLogin();
    this.setData({ userId: (user && user.userId) || '' });
    const res = await callFunction('getMyProfile');
    if (res && res.profile) {
      this.setData({ stories: res.profile.stories || [] });
    }
    this.initRecorder();
    this._audio = wx.createInnerAudioContext();
  },

  onUnload() {
    if (this._audio) {
      this._audio.destroy();
      this._audio = null;
    }
  },

  initRecorder() {
    this._recorder = wx.getRecorderManager();
    this._recorder.onStart(() => {
      // 状态由 data.recordingIndex 驱动（onTapRecord 已设置）
    });
    this._recorder.onStop((res) => {
      this.handleRecorded(this._lastRecordingIndex, res && res.tempFilePath);
    });
    this._recorder.onError(() => {
      this.setData({ recordingIndex: -1 });
      wx.showToast({ title: '录音失败', icon: 'none' });
    });
  },

  onAddStory() {
    if (this.data.stories.length >= 5) return;
    this.setData({ stories: this.data.stories.concat([{ topic: '', audioFileID: '' }]) });
  },

  // 每行话题选择（话题需唯一）
  onPickTopic(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const topic = STORY_TOPICS[Number(e.detail.value)];
    if (this.data.stories.some((s, i) => i !== idx && s.topic === topic)) {
      wx.showToast({ title: '该话题已选择', icon: 'none' });
      return;
    }
    this.setData({ ['stories[' + idx + '].topic']: topic });
  },

  onTapRecord(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (this.data.recordingIndex >= 0) return; // 已在录音
    if (!this.data.stories[idx].topic) {
      wx.showToast({ title: '请先选择话题', icon: 'none' });
      return;
    }
    this._lastRecordingIndex = idx;
    this.setData({ recordingIndex: idx });
    this._recorder.start({ duration: 60000, format: 'mp3' });
  },

  onTapStop() {
    if (this.data.recordingIndex < 0) return;
    this._recorder.stop();
  },

  async handleRecorded(idx, tempFilePath) {
    this.setData({ recordingIndex: -1 });
    if (idx == null || !tempFilePath) return;
    wx.showLoading({ title: '上传中' });
    const fileID = await uploadAudio('stories/' + (this.data.userId || 'unknown'), tempFilePath);
    wx.hideLoading();
    if (!fileID) {
      wx.showToast({ title: '上传失败', icon: 'none' });
      return;
    }
    this.setData({ ['stories[' + idx + '].audioFileID']: fileID, playingIndex: -1 });
    await this.persist();
  },

  onTogglePlay(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const fileID = this.data.stories[idx] && this.data.stories[idx].audioFileID;
    if (!fileID) return;
    if (this.data.playingIndex === idx) {
      this._audio.stop();
      this.setData({ playingIndex: -1 });
      return;
    }
    this._audio.stop();
    this._audio.src = fileID;
    this._audio.play();
    this.setData({ playingIndex: idx });
  },

  async onDeleteStory(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const stories = this.data.stories.filter((_, i) => i !== idx);
    this.setData({ stories, playingIndex: -1 });
    await this.persist();
  },

  // 只提交完整行（服务端要求 topic 与 audioFileID 均非空且唯一）
  async persist() {
    const complete = this.data.stories.filter((s) => s.topic && s.audioFileID);
    const res = await callFunction('updateProfile', { patch: { stories: complete } });
    if (res && res.profile) {
      wx.showToast({ title: '已保存', icon: 'success' });
    } else {
      wx.showToast({ title: (res && res.error) || '保存失败', icon: 'none' });
    }
  },
});
