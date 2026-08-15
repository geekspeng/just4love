// tests/unit/upload.test.js —— 云存储直传封装
const { uploadFile, uploadImage, uploadAudio } = require('../../miniprogram/utils/upload.js');

describe('utils/upload', () => {
  beforeEach(() => {
    wx.cloud.uploadFile.mockReset();
  });

  test('uploadFile 成功返回 fileID', async () => {
    wx.cloud.uploadFile.mockResolvedValueOnce({ fileID: 'cloud://abc.jpg' });
    const id = await uploadFile('avatars/u1/x.jpg', 'wxfile://tmp/1.jpg');
    expect(id).toBe('cloud://abc.jpg');
    expect(wx.cloud.uploadFile).toHaveBeenCalledWith({
      cloudPath: 'avatars/u1/x.jpg',
      filePath: 'wxfile://tmp/1.jpg',
    });
  });

  test('uploadFile 失败返回 null（不抛错）', async () => {
    // 静默错误日志避免 Jest 控制台噪音，同时断言确实记录了失败
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    wx.cloud.uploadFile.mockRejectedValueOnce(new Error('quota'));
    expect(await uploadFile('a/b.jpg', 'wxfile://tmp/1.jpg')).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('[upload] failed:', 'a/b.jpg', expect.any(Error));
    errorSpy.mockRestore();
  });

  test('uploadImage 生成去重路径并保留扩展名', async () => {
    wx.cloud.uploadFile.mockImplementation(({ cloudPath }) => Promise.resolve({ fileID: 'cloud://' + cloudPath }));
    const a = await uploadImage('album/u1', 'wxfile://tmp/a.jpg');
    const b = await uploadImage('album/u1', 'wxfile://tmp/b.jpg');
    expect(a).toMatch(/^cloud:\/\/album\/u1\/\d+-[a-z0-9]{6}\.jpg$/);
    expect(a).not.toBe(b);
  });

  test('uploadAudio 无扩展名时用 mp3', async () => {
    wx.cloud.uploadFile.mockImplementation(({ cloudPath }) => Promise.resolve({ fileID: 'cloud://' + cloudPath }));
    const id = await uploadAudio('stories/u1', 'wxfile://tmp/rec');
    expect(id).toMatch(/\.mp3$/);
  });
});
