// utils/upload.js —— 云存储直传封装（头像/相册/语音走 wx.cloud.uploadFile，不经云函数）

function genCloudPath(prefix, filePath, fallbackExt) {
  const dot = filePath.lastIndexOf('.');
  const ext = dot >= 0 && dot > filePath.length - 8 ? filePath.slice(dot + 1) : fallbackExt;
  return prefix + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
}

// 成功返回 fileID，失败返回 null（调用方 toast 提示）
function uploadFile(cloudPath, filePath) {
  if (typeof wx === 'undefined' || !wx.cloud) {
    return Promise.resolve(null);
  }
  return wx.cloud
    .uploadFile({ cloudPath, filePath })
    .then((res) => (res && res.fileID) || null)
    .catch((err) => {
      console.error('[upload] failed:', cloudPath, err);
      return null;
    });
}

function uploadImage(prefix, filePath) {
  return uploadFile(genCloudPath(prefix, filePath, 'jpg'), filePath);
}

function uploadAudio(prefix, filePath) {
  return uploadFile(genCloudPath(prefix, filePath, 'mp3'), filePath);
}

module.exports = { uploadFile, uploadImage, uploadAudio };
