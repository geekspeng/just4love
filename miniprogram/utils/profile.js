// utils/profile.js —— 资料空模板与草稿校验（结构契约见实现计划）

function createEmptyProfile(user) {
  const u = user || {};
  return {
    userId: u.userId || '',
    openid: u.openid || '',
    basicInit: false,
    basic: {
      guestNo: u.guestNo || '',
      nickname: '',
      gender: '',
      birthday: '',
      constellation: '',
      avatarFileID: '',
      signature: '',
    },
    about: {
      aboutMe: '', aboutYou: '', loveGoal: '', emotionalStatus: '',
      height: null, education: '', job: '', city: '', hometown: '', school: '',
      familyBackground: [],
      smoke: '', drink: '', gamble: '',
    },
    privacy: {
      asset: { house: '', car: '', income: '' },
      contact: { phone: '', wechat: '' },
    },
    album: [],
    stories: [],
    tags: { hobby: [], personality: [], food: [], media: [] },
  };
}

// 编辑页保存前校验：basicInit 为 false 时昵称/性别/生日必填
function validateProfileDraft(draft) {
  if (!draft) return { ok: false, message: '资料未加载' };
  if (draft.basicInit) return { ok: true };
  const b = draft.basic || {};
  if (!b.nickname || !String(b.nickname).trim()) return { ok: false, message: '请填写昵称' };
  if (!b.gender) return { ok: false, message: '请选择性别' };
  if (!b.birthday) return { ok: false, message: '请选择生日' };
  return { ok: true };
}

module.exports = { createEmptyProfile, validateProfileDraft };
