# 遇见爱 P1「登录与个人资料」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户通过微信静默登录注册为嘉宾，完整编辑相亲资料（基本资料/相亲信息/隐私字段/相册/故事/标签），并以他人视角预览自己的完整资料卡——P1 结束即为可上线的供给端闭环。

**Architecture:** 沿用现有骨架：原生小程序 + 微信云开发（云函数/云数据库/云存储）。新增 5 个云函数（`login`/`getMyProfile`/`updateProfile`/`bindPhone`/`deleteAccount`），核心逻辑抽为「openid + 注入 db」的内部函数，集成测试注入内存 mock 数据库，**懒 require `wx-server-sdk`** 保证测试无需安装该依赖。前端将 `recommend-card` 演进为完整资料卡组件 `profile-card`（Task 10 重命名，Task 11-12 增强），编辑页产出统一 profile 文档结构，预览页复用同一组件。登录态由 `utils/auth.js` 统一管理（本地缓存 + 启动恢复 + 静默刷新）。

**Tech Stack:** 微信原生小程序（JS/WXML/WXSS）、wx-server-sdk（~2.6.3，部署时云端安装依赖）、Jest + miniprogram-simulate（单测）、Jest 直接 require 云函数（集成）、miniprogram-automator（E2E，TS）。

**规格来源:** `docs/superpowers/specs/2026-08-15-just4love-phased-roadmap-design.md` §4（P1）、§9（贯穿性设计）、§10（验收口径）。

**对规格的两处补充（规格 §4.6 云函数列表之外）:**
- `bindPhone`：§4.1 手机号可选绑定需要服务端解码 `getPhoneNumber` 的 code；
- `deleteAccount`：§4.5 注销「删除账号数据」需要服务端删除，微信官方要求真实删除。

## Global Constraints

- 只做 P1：**不做**浏览他人（P2）、配额（P2）、互动（P3）、认证（P4）、DNA（P5）。
- 原生小程序，不引入框架/UI 库/TS（E2E 测试文件沿用现有 TS 设施）。
- 主题色 `#FF5A5F`；全局类 `.container`/`.card`/`.text-secondary` 与 CSS 变量沿用 `miniprogram/app.wxss`；样式命名沿用 BEM 风格（`模块名__元素`）。
- 选项池「值为文案」：选中值即展示文案（如 `'独生子女'`），直接入库，**无 value↔label 映射**。
- 云函数代码**不能** require `miniprogram/utils/`（部署根不同）；服务端只校验结构与数量，枚举值校验在前端。
- 云函数模块顶层**不得** require `wx-server-sdk`（懒 require），否则集成测试崩溃；集成测试只调导出的内部函数（`xxxByOpenid(openid, db, …)`），永不调 `main`。
- 锁定字段：`basic.nickname/gender/birthday/constellation` 在 `basicInit === true` 后不可改；`basic.avatarFileID/signature` 随时可改。
- 嘉宾编号格式：`'J' + 4 位起序号`（`J0001`，超 9999 自然增长为 `J10000`）。
- 隐私字段（资产/联系方式）存储但**任何他人视角页面均不渲染明文**（预览页也只显示 🔒 占位，P3 激活授权流）。
- 所有页面在云调用失败（`request.js` 返回 `null`）时必须保持可渲染（E2E 在无部署云环境下运行）。
- 测试命令：`npm run test:unit` / `npm run test:integration` / `npm test`（= unit+integration）；E2E `npm run test:e2e`（需本机微信开发者工具）。E2E 必须遵守 `.claude/skills/e2e-test/SKILL.md`：仅 App 级通道（禁 `page.$()`/`page.data()`），复用 `tests/e2e/helpers.ts` 原语，每个 `it` 显式传 `T`。
- 提交信息风格：`type(scope): 中文描述`（与仓库现有历史一致）。
- 每个任务结束时 `npm test` 必须全绿（不破坏已有测试）。

## File Structure（本计划完成后新增/修改全览）

```
miniprogram/
├── utils/
│   ├── constellation.js        # [新] 生日→星座 纯函数
│   ├── options.js              # [新] 选项池常量（值为文案）+ LIMITS
│   ├── profile.js              # [新] createEmptyProfile / validateProfileDraft
│   ├── auth.js                 # [新] 登录态：缓存/ensureLogin/clearLogin/bindPhoneWithCode
│   └── upload.js               # [新] 云存储直传：uploadImage/uploadAudio
├── components/
│   └── profile-card/           # [重命名自 recommend-card，再增强]
├── pages/
│   ├── mine/                   # [改] 登录态+资料概览+入口菜单逐个接通
│   ├── profile-edit/           # [新] 基本资料+相亲信息+隐私字段编辑
│   ├── album-edit/             # [新] 5 分类照片
│   ├── story-edit/             # [新] 5 个故事（话题+录音）
│   ├── tags-edit/              # [新] 4 类标签多选
│   ├── profile-preview/        # [新] 他人视角资料卡预览
│   ├── settings/               # [新] 设置（帮助/关于/协议/隐私/注销/退出）
│   └── agreement/              # [新] 静态文案页（?type=help|about|user|privacy）
└── app.js                      # [改] onLaunch 恢复登录态
cloudfunctions/
├── login/                      # [新] 静默登录+建档+嘉宾编号（counters 自增）
├── getMyProfile/               # [新] 取我的 users+profiles
├── updateProfile/              # [新] 白名单校验+锁定+整段替换 upsert
├── bindPhone/                  # [新] getPhoneNumber code→手机号→users.phone
└── deleteAccount/              # [新] 注销：删 users+profiles 文档
tests/
├── helpers/mock-db.js          # [新] 内存 mock 云数据库（集成测试共用）
├── unit/                       # constellation/options/profile/auth/upload/profile-card
├── integration/                # login/getMyProfile/updateProfile/bindPhone/deleteAccount
└── e2e/p1-profile.test.ts      # [新] P1 关键路径
```

## profiles 文档结构（多个任务共同依赖的契约，实现须与此完全一致）

```js
{
  _id, openid, userId,          // userId = users._id
  basicInit: false,             // 昵称/性别/生日首次提交后置 true（锁定标记）
  basic: {
    guestNo: 'J0001',           // 冗余自 users，便于 P2 列表查询
    nickname: '', gender: '',   // gender: '男' | '女'
    birthday: '',               // 'YYYY-MM-DD'（picker 输出格式）
    constellation: '',          // 前端由生日推算后随 basic 提交
    avatarFileID: '',           // 云存储 fileID；头像本地临时路径不入库
    signature: '',
  },
  about: {
    aboutMe: '', aboutYou: '', loveGoal: '', emotionalStatus: '',
    height: null,               // number(cm) | null
    education: '', job: '', city: '', hometown: '', school: '',
    familyBackground: [],       // ≤12，值为选项文案
    smoke: '', drink: '', gamble: '',   // '' | '从不' | '偶尔' | '经常'
  },
  privacy: {
    asset: { house: '', car: '', income: '' },
    contact: { phone: '', wechat: '' },
  },
  album: [ { category: '', fileID: '' } ],     // ≤5，category 唯一
  stories: [ { topic: '', audioFileID: '' } ], // ≤5，topic 唯一且非空
  tags: { hobby: [], personality: [], food: [], media: [] }, // 每类 ≤5
  updatedAt: '',
}
```

`users` 文档：`{ _id, openid, phone: '', role: 'normal', guestNo: 'J0001', createdAt: '' }`（role 预置，管理员=控制台手改，见 Task 21 文档）。

`updateProfile` 的 patch 约定：**前端总是提交完整段对象**（如整个 `about`），服务端按顶层字段整体替换。

---

### Task 1: 星座推算纯函数 `utils/constellation.js`

**Files:**
- Create: `miniprogram/utils/constellation.js`
- Test: `tests/unit/constellation.test.js`

**Interfaces:**
- Produces: `getConstellation(birthday: string): string` — 入参 `'YYYY-MM-DD'`，返回如 `'白羊座'`；非法/不完整输入返回 `''`。Task 14（编辑页）与后端契约依赖它。

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/constellation.test.js —— 星座推算纯函数
const { getConstellation } = require('../../miniprogram/utils/constellation.js');

describe('utils/constellation', () => {
  test('星座起始日边界：1/19 摩羯、1/20 水瓶', () => {
    expect(getConstellation('1995-01-19')).toBe('摩羯座');
    expect(getConstellation('1995-01-20')).toBe('水瓶座');
  });

  test('星座起始日边界：12/21 射手、12/22 摩羯（跨年）', () => {
    expect(getConstellation('1990-12-21')).toBe('射手座');
    expect(getConstellation('1990-12-22')).toBe('摩羯座');
  });

  test('12 个星座全覆盖', () => {
    const cases = [
      ['1995-01-25', '水瓶座'], ['1995-02-25', '双鱼座'], ['1995-03-25', '白羊座'],
      ['1995-04-25', '金牛座'], ['1995-05-25', '双子座'], ['1995-06-25', '巨蟹座'],
      ['1995-07-25', '狮子座'], ['1995-08-25', '处女座'], ['1995-09-25', '天秤座'],
      ['1995-10-25', '天蝎座'], ['1995-11-25', '射手座'], ['1995-12-25', '摩羯座'],
    ];
    cases.forEach(([d, expected]) => expect(getConstellation(d)).toBe(expected));
  });

  test('非法输入返回空串', () => {
    expect(getConstellation('')).toBe('');
    expect(getConstellation('1995-1-5')).toBe('');   // 必须零填充
    expect(getConstellation('1995-13-01')).toBe(''); // 月非法
    expect(getConstellation('1995-00-10')).toBe('');
    expect(getConstellation('1995-06-31')).toBe(''); // 日非法
    expect(getConstellation(null)).toBe('');
    expect(getConstellation(19950615)).toBe('');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:unit -- constellation`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现**

```js
// utils/constellation.js —— 生日 → 星座（纯函数，便于单元测试）
// 仅接受 'YYYY-MM-DD'（微信 picker mode="date" 的输出格式）。

// 每个星座的起始日 [月, 日, 星座名]，按时间顺序排列
const STARTS = [
  [1, 20, '水瓶座'], [2, 19, '双鱼座'], [3, 21, '白羊座'], [4, 20, '金牛座'],
  [5, 21, '双子座'], [6, 22, '巨蟹座'], [7, 23, '狮子座'], [8, 23, '处女座'],
  [9, 23, '天秤座'], [10, 24, '天蝎座'], [11, 23, '射手座'], [12, 22, '摩羯座'],
];

function getConstellation(birthday) {
  if (typeof birthday !== 'string') return '';
  const m = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  // 找到第一个「尚未到达」的起始日，其前一项即当前星座
  const idx = STARTS.findIndex(([sm, sd]) => month < sm || (month === sm && day < sd));
  if (idx === -1 || idx === 0) return '摩羯座'; // 12/22 之后 与 1/20 之前 都是摩羯
  return STARTS[idx - 1][2];
}

module.exports = { getConstellation };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:unit -- constellation`
Expected: PASS（4 个用例）

- [ ] **Step 5: 全量回归 + 提交**

```bash
npm test
git add miniprogram/utils/constellation.js tests/unit/constellation.test.js
git commit -m "feat(utils): 星座推算纯函数"
```

---

### Task 2: 选项池 `utils/options.js` + 资料模板 `utils/profile.js`

**Files:**
- Create: `miniprogram/utils/options.js`
- Create: `miniprogram/utils/profile.js`
- Test: `tests/unit/options.test.js`、`tests/unit/profile.test.js`

**Interfaces:**
- Produces（Task 14-18 依赖）:
  - `options.js` 导出：`LOVE_GOALS`(4)、`EMOTIONAL_STATUS`(3)、`FAMILY_BACKGROUND`(12)、`HABITS`(3)、`EDUCATIONS`(5)、`JOBS`(11)、`ALBUM_CATEGORIES`(5)、`TAG_POOLS`(对象，4 键各 8 项)、`STORY_TOPICS`(12)、`LIMITS` 对象
  - `profile.js` 导出：`createEmptyProfile(user: {userId?, guestNo?, openid?}|null): profile`（结构见上方契约）；`validateProfileDraft(draft): {ok: boolean, message?: string}`——`basicInit` 为 false 时昵称/性别/生日必填

- [ ] **Step 1: 写失败测试（options）**

```js
// tests/unit/options.test.js —— 选项池常量结构与数量守卫（防手滑改错）
const o = require('../../miniprogram/utils/options.js');

describe('utils/options', () => {
  test('恋爱目标为规格中的 4 个选项', () => {
    expect(o.LOVE_GOALS).toEqual([
      '短期内想结婚',
      '认真谈场恋爱如果合适可以考虑结婚',
      '先认真谈场恋爱再说',
      '没考虑清楚',
    ]);
  });

  test('家庭背景 12 项、含规格列举的关键项', () => {
    expect(o.FAMILY_BACKGROUND).toHaveLength(12);
    ['独生子女', '拆二代', '单亲或离异', '父母有退休金'].forEach((x) =>
      expect(o.FAMILY_BACKGROUND).toContain(x)
    );
  });

  test('生活习惯/学历/职业选项非空', () => {
    expect(o.HABITS).toEqual(['从不', '偶尔', '经常']);
    expect(o.EDUCATIONS).toHaveLength(5);
    expect(o.JOBS.length).toBeGreaterThanOrEqual(10);
  });

  test('相册 5 分类与规格一致', () => {
    expect(o.ALBUM_CATEGORIES).toEqual([
      '日常生活', '兴趣爱好', '旅行经历', '家有萌宠', '健身运动',
    ]);
  });

  test('标签池 4 类、每类非空且无重复项', () => {
    expect(Object.keys(o.TAG_POOLS)).toEqual(['hobby', 'personality', 'food', 'media']);
    Object.values(o.TAG_POOLS).forEach((pool) => {
      expect(pool.length).toBeGreaterThanOrEqual(6);
      expect(new Set(pool).size).toBe(pool.length);
    });
  });

  test('故事话题池 ≥10 且 LIMITS 数量守卫', () => {
    expect(o.STORY_TOPICS.length).toBeGreaterThanOrEqual(10);
    expect(o.LIMITS).toEqual({
      ALBUM_MAX: 5, STORIES_MAX: 5, TAGS_PER_CATEGORY_MAX: 5, FAMILY_MAX: 12,
    });
  });
});
```

- [ ] **Step 2: 写失败测试（profile 模板）**

```js
// tests/unit/profile.test.js —— 空资料模板与草稿校验
const { createEmptyProfile, validateProfileDraft } = require('../../miniprogram/utils/profile.js');

describe('utils/profile', () => {
  test('空模板结构与契约一致', () => {
    const p = createEmptyProfile({ userId: 'u1', guestNo: 'J0007', openid: 'ox' });
    expect(p.userId).toBe('u1');
    expect(p.openid).toBe('ox');
    expect(p.basicInit).toBe(false);
    expect(p.basic.guestNo).toBe('J0007');
    expect(p.about.height).toBeNull();
    expect(p.about.familyBackground).toEqual([]);
    expect(p.privacy.asset).toEqual({ house: '', car: '', income: '' });
    expect(p.album).toEqual([]);
    expect(p.stories).toEqual([]);
    expect(p.tags).toEqual({ hobby: [], personality: [], food: [], media: [] });
  });

  test('user 为 null 时给出安全默认值', () => {
    const p = createEmptyProfile(null);
    expect(p.userId).toBe('');
    expect(p.basic.guestNo).toBe('');
  });

  test('两次调用不共享引用（深结构各自独立）', () => {
    const a = createEmptyProfile(null);
    const b = createEmptyProfile(null);
    a.about.familyBackground.push('独生子女');
    a.tags.hobby.push('旅行');
    expect(b.about.familyBackground).toEqual([]);
    expect(b.tags.hobby).toEqual([]);
  });

  test('未初始化基本资料时：昵称/性别/生日缺一不可', () => {
    const p = createEmptyProfile(null);
    expect(validateProfileDraft(p).ok).toBe(false);
    p.basic.nickname = '小鱼';
    expect(validateProfileDraft(p).message).toBe('请选择性别');
    p.basic.gender = '女';
    expect(validateProfileDraft(p).message).toBe('请选择生日');
    p.basic.birthday = '1995-06-15';
    expect(validateProfileDraft(p).ok).toBe(true);
  });

  test('已初始化（basicInit）时允许其余字段为空直接保存', () => {
    const p = createEmptyProfile(null);
    p.basicInit = true;
    const r = validateProfileDraft(p);
    expect(r.ok).toBe(true);
  });

  test('昵称纯空白视为未填写', () => {
    const p = createEmptyProfile(null);
    p.basic.nickname = '   ';
    expect(validateProfileDraft(p).message).toBe('请填写昵称');
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm run test:unit -- options` 与 `npm run test:unit -- profile`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 `options.js`**

```js
// utils/options.js —— 选项池常量（「值为文案」：选中的值即展示文案，直接入库）
// 云函数无法 require 本模块（部署根不同）；服务端只校验结构与数量，枚举值在前端约束。

const LOVE_GOALS = [
  '短期内想结婚',
  '认真谈场恋爱如果合适可以考虑结婚',
  '先认真谈场恋爱再说',
  '没考虑清楚',
];

const EMOTIONAL_STATUS = ['单身未婚', '离异', '丧偶'];

const FAMILY_BACKGROUND = [
  '独生子女', '有兄弟姐妹', '知识分子家庭', '领导高管', '做生意的',
  '国企事业单位', '家里有田', '拆二代', '爷爷奶奶带大',
  '在亲戚家长大', '单亲或离异', '父母有退休金',
];

const HABITS = ['从不', '偶尔', '经常']; // 吸烟/喝酒/打牌共用

const EDUCATIONS = ['高中及以下', '大专', '本科', '硕士', '博士'];

const JOBS = [
  '互联网/IT', '金融', '教育', '医疗', '政府/事业单位', '制造业',
  '商业/贸易', '文化传媒', '自由职业', '学生', '其他',
];

const ALBUM_CATEGORIES = ['日常生活', '兴趣爱好', '旅行经历', '家有萌宠', '健身运动'];

const TAG_POOLS = {
  hobby: ['旅行', '美食', '摄影', '运动', '游戏', '阅读', '音乐', '电影'],
  personality: ['开朗', '内向', '稳重', '幽默', '细心', '独立', '感性', '理性'],
  food: ['火锅', '烧烤', '日料', '川菜', '粤菜', '甜品', '咖啡', '小吃'],
  media: ['科幻', '悬疑', '喜剧', '纪录片', '动漫', '综艺', '美剧', '音乐剧'],
};

const STORY_TOPICS = [
  '我的周末', '一次难忘的旅行', '我为什么单身', '我的工作日常',
  '家庭对我的影响', '我最自豪的事', '理想的约会', '我的爱好',
  '未来五年规划', '我的爱情观', '难忘的友情', '家乡的味道',
];

const LIMITS = {
  ALBUM_MAX: 5,
  STORIES_MAX: 5,
  TAGS_PER_CATEGORY_MAX: 5,
  FAMILY_MAX: 12,
};

module.exports = {
  LOVE_GOALS, EMOTIONAL_STATUS, FAMILY_BACKGROUND, HABITS, EDUCATIONS, JOBS,
  ALBUM_CATEGORIES, TAG_POOLS, STORY_TOPICS, LIMITS,
};
```

- [ ] **Step 5: 实现 `profile.js`**

```js
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
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm run test:unit -- options` 与 `npm run test:unit -- profile`
Expected: PASS

- [ ] **Step 7: 全量回归 + 提交**

```bash
npm test
git add miniprogram/utils/options.js miniprogram/utils/profile.js tests/unit/options.test.js tests/unit/profile.test.js
git commit -m "feat(utils): 选项池常量与资料空模板"
```

---

### Task 3: 云函数 `login`（静默登录 + 嘉宾编号）+ 共享 mock 云数据库

**Files:**
- Create: `cloudfunctions/login/index.js`、`cloudfunctions/login/package.json`
- Create: `tests/helpers/mock-db.js`（本任务建立，后续云函数测试共用）
- Test: `tests/integration/login.test.js`

**Interfaces:**
- Produces:
  - `login` 云函数 `main()` → `{ user: { userId, openid, phone, role, guestNo }, isNew: boolean }`（无 error 分支：首次自动建档）
  - 导出 `loginWithOpenid(openid, db)`、`nextGuestNo(db)`（集成测试用）
  - `mock-db.js` → `createMockDb(initial?)` 返回 `{ collection(name), command: { inc } }`，支持 `where(eq).get()` / `doc(id).get()|set()|update()|remove()` / `add()`（`doc.get` 不存在时抛错、`update` 不存在时 `{updated:0}`，与云数据库语义一致）

- [ ] **Step 1: 写失败测试**

```js
// tests/integration/login.test.js —— login 云函数（注入 mock 数据库）
const { createMockDb } = require('../helpers/mock-db.js');
const { loginWithOpenid, nextGuestNo } = require('../../cloudfunctions/login/index.js');

describe('cloudfunctions/login', () => {
  test('首次登录：自动建档，嘉宾编号 J0001，角色 normal', async () => {
    const db = createMockDb();
    const res = await loginWithOpenid('openid-a', db);
    expect(res.isNew).toBe(true);
    expect(res.user.guestNo).toBe('J0001');
    expect(res.user.role).toBe('normal');
    expect(res.user.phone).toBe('');
    expect(res.user.userId).toBeTruthy();
    const users = await db.collection('users').where({ openid: 'openid-a' }).get();
    expect(users.data).toHaveLength(1);
  });

  test('同一 openid 再次登录：不新建档，返回同一用户', async () => {
    const db = createMockDb();
    const first = await loginWithOpenid('openid-a', db);
    const second = await loginWithOpenid('openid-a', db);
    expect(second.isNew).toBe(false);
    expect(second.user.userId).toBe(first.user.userId);
    expect(second.user.guestNo).toBe('J0001');
  });

  test('第二个新用户递增为 J0002', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const res = await loginWithOpenid('openid-b', db);
    expect(res.user.guestNo).toBe('J0002');
  });

  test('计数器超过 9999 时自然增长为 J10000', async () => {
    const db = createMockDb({ counters: { guestNo: { _id: 'guestNo', seq: 9999 } } });
    expect(await nextGuestNo(db)).toBe('J10000');
  });

  test('user VO 字段精确（不泄漏内部字段）', async () => {
    const db = createMockDb();
    const { user } = await loginWithOpenid('openid-a', db);
    expect(Object.keys(user).sort()).toEqual(['guestNo', 'openid', 'phone', 'role', 'userId']);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:integration -- login`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现共享 mock 数据库 `tests/helpers/mock-db.js`**

```js
// tests/helpers/mock-db.js —— 内存版云数据库 mock（集成测试共用）
// 仅实现本项目云函数用到的子集：
//   collection(name).where(等值查询).get() → { data: [...] }
//   collection(name).doc(id).get() → { data }（不存在时抛错，同云数据库语义）
//   collection(name).doc(id).set({ data })（整篇替换）/ .update({ data })（不存在 → { updated: 0 }）
//   collection(name).doc(id).remove()
//   collection(name).add({ data }) → { _id }（支持自定义 data._id）
//   db.command.inc(n)（仅 update 时解释）
const clone = (v) => JSON.parse(JSON.stringify(v));

function createMockDb(initial = {}) {
  const store = {}; // name → { id → doc }
  for (const name of Object.keys(initial)) {
    store[name] = clone(initial[name]);
  }

  function applyUpdate(doc, data) {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && v.__inc !== undefined) {
        doc[k] = (doc[k] || 0) + v.__inc; // 普通对象为整字段替换（同云数据库 update），仅 inc 特判
      } else {
        doc[k] = v;
      }
    }
  }

  return {
    command: { inc: (n) => ({ __inc: n }) },
    collection(name) {
      store[name] = store[name] || {};
      const col = store[name];
      return {
        add: async ({ data }) => {
          const id = data._id || 'id_' + name + '_' + (Object.keys(col).length + 1);
          col[id] = clone({ ...data, _id: id });
          return { _id: id };
        },
        doc: (id) => ({
          get: async () => {
            if (!(id in col)) {
              const err = new Error('document not exists');
              err.errCode = -1;
              throw err;
            }
            return { data: clone(col[id]) };
          },
          set: async ({ data }) => {
            col[id] = clone({ ...data, _id: id });
            return { updated: 1 };
          },
          update: async ({ data }) => {
            if (!(id in col)) return { updated: 0 };
            applyUpdate(col[id], clone(data));
            return { updated: 1 };
          },
          remove: async () => {
            delete col[id];
            return { deleted: 1 };
          },
        }),
        where: (query) => ({
          get: async () => ({
            data: Object.values(col)
              .filter((d) => Object.keys(query).every((k) => d[k] === query[k]))
              .map(clone),
          }),
        }),
      };
    },
  };
}

module.exports = { createMockDb };
```

- [ ] **Step 4: 实现 `cloudfunctions/login/index.js`**

```js
// login 云函数 —— 微信静默登录
// getWXContext() 取 openid；首次登录自动创建 users 文档并生成嘉宾编号
//（counters 集合原子自增，J0001 递增）。返回 { user, isNew }。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

// 嘉宾编号：counters/guestNo 自增后读取。
// 已知限制：update(inc) 原子但随后的 get 并非原子，极端并发下可能重号；P1 低并发可接受。
async function nextGuestNo(db) {
  const counters = db.collection('counters');
  const doc = counters.doc('guestNo');
  try {
    await doc.get();
  } catch (e) {
    await counters.add({ data: { _id: 'guestNo', seq: 0 } });
  }
  await doc.update({ data: { seq: db.command.inc(1) } });
  const after = await doc.get();
  return 'J' + String(after.data.seq).padStart(4, '0');
}

function toUserVO(u) {
  return {
    userId: u._id, openid: u.openid, phone: u.phone || '',
    role: u.role, guestNo: u.guestNo,
  };
}

async function loginWithOpenid(openid, db) {
  const users = db.collection('users');
  const found = await users.where({ openid }).get();
  if (found.data.length > 0) {
    return { isNew: false, user: toUserVO(found.data[0]) };
  }
  const guestNo = await nextGuestNo(db);
  const added = await users.add({
    data: { openid, phone: '', role: 'normal', guestNo, createdAt: new Date().toISOString() },
  });
  return {
    isNew: true,
    user: toUserVO({ _id: added._id, openid, phone: '', role: 'normal', guestNo }),
  };
}

exports.main = async () => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const { OPENID } = cloud.getWXContext();
  return loginWithOpenid(OPENID, getDb());
};
exports.loginWithOpenid = loginWithOpenid;
exports.nextGuestNo = nextGuestNo;
```

- [ ] **Step 5: 新建 `cloudfunctions/login/package.json`**

```json
{
  "name": "login",
  "version": "1.0.0",
  "description": "微信静默登录：openid 建档 + 嘉宾编号生成",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  },
  "private": true
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm run test:integration -- login`
Expected: PASS（5 个用例）

- [ ] **Step 7: 全量回归 + 提交**

```bash
npm test
git add cloudfunctions/login tests/helpers/mock-db.js tests/integration/login.test.js
git commit -m "feat(cloud): login 云函数与 mock 云数据库测试基座"
```

---

### Task 4: 云函数 `getMyProfile`

**Files:**
- Create: `cloudfunctions/getMyProfile/index.js`、`cloudfunctions/getMyProfile/package.json`
- Test: `tests/integration/getMyProfile.test.js`

**Interfaces:**
- Consumes: mock-db（Task 3）
- Produces: `main()` / `getMyProfileByOpenid(openid, db)` → `{ user: UserVO, profile: object|null }` 或 `{ error: 'user not found' }`（前端须先调 `login`）。`UserVO` 形状同 Task 3。Task 9/14/15/16/17/18 前端通过 `request.callFunction('getMyProfile')` 消费。

- [ ] **Step 1: 写失败测试**

```js
// tests/integration/getMyProfile.test.js
const { createMockDb } = require('../helpers/mock-db.js');
const { getMyProfileByOpenid } = require('../../cloudfunctions/getMyProfile/index.js');
const { loginWithOpenid } = require('../../cloudfunctions/login/index.js');

describe('cloudfunctions/getMyProfile', () => {
  test('用户不存在（未先 login）返回错误', async () => {
    const db = createMockDb();
    const res = await getMyProfileByOpenid('openid-none', db);
    expect(res.error).toBe('user not found');
  });

  test('有用户但尚未填资料：profile 为 null，user 完整', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const res = await getMyProfileByOpenid('openid-a', db);
    expect(res.error).toBeUndefined();
    expect(res.profile).toBeNull();
    expect(res.user.guestNo).toBe('J0001');
    expect(res.user.role).toBe('normal');
  });

  test('已有资料文档时原样返回', async () => {
    const db = createMockDb({
      users: { u1: { _id: 'u1', openid: 'openid-a', phone: '', role: 'normal', guestNo: 'J0001' } },
      profiles: {
        p1: { _id: 'p1', openid: 'openid-a', userId: 'u1', basicInit: true, basic: { nickname: '小鱼' } },
      },
    });
    const res = await getMyProfileByOpenid('openid-a', db);
    expect(res.profile._id).toBe('p1');
    expect(res.profile.basic.nickname).toBe('小鱼');
    expect(res.user.userId).toBe('u1');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:integration -- getMyProfile`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// getMyProfile 云函数 —— 取当前登录用户的 users + profiles 文档
// 返回 { user, profile }；profile 不存在时为 null（前端用 createEmptyProfile 兜底）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

function toUserVO(u) {
  return {
    userId: u._id, openid: u.openid, phone: u.phone || '',
    role: u.role, guestNo: u.guestNo,
  };
}

async function getMyProfileByOpenid(openid, db) {
  const users = db.collection('users');
  const found = await users.where({ openid }).get();
  if (found.data.length === 0) return { error: 'user not found' };
  const profiles = db.collection('profiles');
  const pf = await profiles.where({ openid }).get();
  return { user: toUserVO(found.data[0]), profile: pf.data[0] || null };
}

exports.main = async () => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  return getMyProfileByOpenid(cloud.getWXContext().OPENID, getDb());
};
exports.getMyProfileByOpenid = getMyProfileByOpenid;
```

`cloudfunctions/getMyProfile/package.json`（name 改为 `getMyProfile`，其余与 Task 3 Step 5 相同，description「获取我的用户与资料文档」）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:integration -- getMyProfile`
Expected: PASS（3 个用例）

- [ ] **Step 5: 全量回归 + 提交**

```bash
npm test
git add cloudfunctions/getMyProfile tests/integration/getMyProfile.test.js
git commit -m "feat(cloud): getMyProfile 云函数"
```

---

### Task 5: 云函数 `updateProfile`（白名单校验 + 基本资料锁定 + upsert）

**Files:**
- Create: `cloudfunctions/updateProfile/index.js`、`cloudfunctions/updateProfile/package.json`
- Test: `tests/integration/updateProfile.test.js`

**Interfaces:**
- Consumes: mock-db、profiles 契约（见计划头部）
- Produces: `main(event)`，`event = { patch }` → `{ profile }`（合并后的完整文档）或 `{ error }`；导出 `updateProfileByOpenid(openid, patch, db)`。patch 顶层只允许 `basic/about/privacy/album/stories/tags`，且**总是提交完整段对象**（服务端整段替换）。

- [ ] **Step 1: 写失败测试**

```js
// tests/integration/updateProfile.test.js
const { createMockDb } = require('../helpers/mock-db.js');
const { updateProfileByOpenid } = require('../../cloudfunctions/updateProfile/index.js');
const { loginWithOpenid } = require('../../cloudfunctions/login/index.js');

const INIT_PATCH = {
  basic: { nickname: '小鱼', gender: '女', birthday: '1995-06-15', constellation: '双子座', signature: '你好' },
};

describe('cloudfunctions/updateProfile', () => {
  test('未登录用户返回错误', async () => {
    const res = await updateProfileByOpenid('openid-x', { about: {} }, createMockDb());
    expect(res.error).toBe('user not found');
  });

  test('首次提交基本资料：写入并置 basicInit=true', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const res = await updateProfileByOpenid('openid-a', INIT_PATCH, db);
    expect(res.error).toBeUndefined();
    expect(res.profile.basicInit).toBe(true);
    expect(res.profile.basic.nickname).toBe('小鱼');
    expect(res.profile.userId).toBeTruthy();
  });

  test('basicInit 后修改昵称被拒绝（basic locked）', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    await updateProfileByOpenid('openid-a', INIT_PATCH, db);
    const res = await updateProfileByOpenid('openid-a', {
      basic: { nickname: '大鱼', gender: '女', birthday: '1995-06-15' },
    }, db);
    expect(res.error).toBe('basic locked');
  });

  test('basicInit 后原值重提 + 修改签名是允许的', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const saved = await updateProfileByOpenid('openid-a', INIT_PATCH, db);
    const res = await updateProfileByOpenid('openid-a', {
      basic: { nickname: '小鱼', gender: '女', birthday: '1995-06-15', signature: '新签名' },
    }, db);
    expect(res.error).toBeUndefined();
    expect(res.profile.basic.signature).toBe('新签名');
    expect(res.profile.basicInit).toBe(true);
  });

  test('patch 含未知顶层字段被拒绝', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const res = await updateProfileByOpenid('openid-a', { role: 'admin' }, db);
    expect(res.error).toBe('invalid patch key: role');
  });

  test('about 段校验：height 非 number 拒绝；familyBackground 超 12 项拒绝', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const bad1 = await updateProfileByOpenid('openid-a', { about: { height: '170' } }, db);
    expect(bad1.error).toBe('invalid about.height');
    const arr13 = Array.from({ length: 13 }, (_, i) => '项' + i);
    const bad2 = await updateProfileByOpenid('openid-a', { about: { familyBackground: arr13 } }, db);
    expect(bad2.error).toBe('invalid about.familyBackground');
  });

  test('album 超 5 项或 category 重复拒绝；合法 album 整段替换', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const six = Array.from({ length: 6 }, (_, i) => ({ category: '类' + i, fileID: 'f' + i }));
    expect((await updateProfileByOpenid('openid-a', { album: six }, db)).error).toBe('invalid album');
    const dup = [
      { category: '日常生活', fileID: 'f1' },
      { category: '日常生活', fileID: 'f2' },
    ];
    expect((await updateProfileByOpenid('openid-a', { album: dup }, db)).error).toBe('duplicate album category');
    const ok = await updateProfileByOpenid('openid-a', {
      album: [{ category: '日常生活', fileID: 'f1' }, { category: '旅行经历', fileID: 'f2' }],
    }, db);
    expect(ok.profile.album).toHaveLength(2);
    // 再提交 1 项：整段替换为 1 项（而非追加）
    const shrink = await updateProfileByOpenid('openid-a', { album: [{ category: '日常生活', fileID: 'f9' }] }, db);
    expect(shrink.profile.album).toEqual([{ category: '日常生活', fileID: 'f9' }]);
  });

  test('stories：topic 缺失/重复拒绝', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    expect((await updateProfileByOpenid('openid-a', {
      stories: [{ topic: '', audioFileID: 'a1' }],
    }, db)).error).toBe('invalid story item');
    expect((await updateProfileByOpenid('openid-a', {
      stories: [{ topic: '我的周末', audioFileID: 'a1' }, { topic: '我的周末', audioFileID: 'a2' }],
    }, db)).error).toBe('duplicate story topic');
  });

  test('tags：未知分类键拒绝；合法 tags 保存', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    expect((await updateProfileByOpenid('openid-a', { tags: { sport: ['跑步'] } }, db)).error)
      .toBe('invalid tags key: sport');
    const ok = await updateProfileByOpenid('openid-a', { tags: { hobby: ['旅行', '美食'] } }, db);
    expect(ok.profile.tags.hobby).toEqual(['旅行', '美食']);
  });

  test('privacy 段保存且入 profiles 文档', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const res = await updateProfileByOpenid('openid-a', {
      privacy: { asset: { house: '有房', car: '' }, contact: { phone: '13800000000', wechat: 'wxid_x' } },
    }, db);
    expect(res.profile.privacy.contact.phone).toBe('13800000000');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:integration -- updateProfile`
Expected: FAIL

- [ ] **Step 3: 实现 `cloudfunctions/updateProfile/index.js`**

```js
// updateProfile 云函数 —— 保存我的资料
// patch 顶层仅允许 basic/about/privacy/album/stories/tags，且为完整段对象（整段替换）。
// basic.nickname/gender/birthday/constellation 仅在 basicInit 前可写；
// 首次三者齐备即置 basicInit=true（之后锁定，同值重提允许）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const PATCH_KEYS = ['basic', 'about', 'privacy', 'album', 'stories', 'tags'];
const LOCKED_BASIC = ['nickname', 'gender', 'birthday', 'constellation'];
const BASIC_KEYS = LOCKED_BASIC.concat(['avatarFileID', 'signature']);
const ABOUT_KEYS = [
  'aboutMe', 'aboutYou', 'loveGoal', 'emotionalStatus', 'height', 'education',
  'job', 'city', 'hometown', 'school', 'familyBackground', 'smoke', 'drink', 'gamble',
];
const PRIVACY_KEYS = { asset: ['house', 'car', 'income'], contact: ['phone', 'wechat'] };
const TAG_KEYS = ['hobby', 'personality', 'food', 'media'];
const ALBUM_MAX = 5;
const STORIES_MAX = 5;
const TAGS_PER_CATEGORY_MAX = 5;
const FAMILY_MAX = 12;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

const isStr = (v) => typeof v === 'string';
const isStrArray = (v, max) =>
  Array.isArray(v) && v.every(isStr) && v.length <= max && new Set(v).size === v.length;

// 返回 { patch }（净化后的段）+ { initNow }，或 { error }
function sanitizePatch(patch, existing) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { error: 'invalid patch' };
  for (const k of Object.keys(patch)) {
    if (PATCH_KEYS.indexOf(k) < 0) return { error: 'invalid patch key: ' + k };
  }
  const out = {};
  const lockedInit = !!(existing && existing.basicInit);
  const eb = (existing && existing.basic) || {};

  if (patch.basic !== undefined) {
    const b = patch.basic;
    if (!b || typeof b !== 'object') return { error: 'invalid basic' };
    const nb = {};
    for (const key of Object.keys(b)) {
      if (BASIC_KEYS.indexOf(key) < 0) continue; // 未知键静默剔除
      if (!isStr(b[key])) return { error: 'invalid basic.' + key };
      if (LOCKED_BASIC.indexOf(key) >= 0 && lockedInit && b[key] !== eb[key]) {
        return { error: 'basic locked' };
      }
      nb[key] = b[key];
    }
    out.basic = nb;
  }

  if (patch.about !== undefined) {
    const a = patch.about;
    if (!a || typeof a !== 'object') return { error: 'invalid about' };
    const na = {};
    for (const key of ABOUT_KEYS) {
      if (!(key in a)) continue;
      const v = a[key];
      if (key === 'height') {
        if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
          return { error: 'invalid about.height' };
        }
        na.height = v;
      } else if (key === 'familyBackground') {
        if (!isStrArray(v, FAMILY_MAX)) return { error: 'invalid about.familyBackground' };
        na[key] = v;
      } else {
        if (!isStr(v)) return { error: 'invalid about.' + key };
        na[key] = v;
      }
    }
    out.about = na;
  }

  if (patch.privacy !== undefined) {
    const pr = patch.privacy;
    if (!pr || typeof pr !== 'object') return { error: 'invalid privacy' };
    const np = {};
    for (const section of Object.keys(PRIVACY_KEYS)) {
      if (pr[section] === undefined) continue;
      const obj = pr[section] || {};
      if (typeof obj !== 'object') return { error: 'invalid privacy' };
      const clean = {};
      for (const k of PRIVACY_KEYS[section]) {
        if (k in obj) {
          if (!isStr(obj[k])) return { error: 'invalid privacy' };
          clean[k] = obj[k];
        }
      }
      np[section] = clean;
    }
    out.privacy = np;
  }

  if (patch.album !== undefined) {
    const al = patch.album;
    if (!Array.isArray(al) || al.length > ALBUM_MAX) return { error: 'invalid album' };
    const cats = new Set();
    for (const it of al) {
      if (!it || typeof it !== 'object' || !isStr(it.category) || !it.category ||
          !isStr(it.fileID) || !it.fileID) return { error: 'invalid album item' };
      if (cats.has(it.category)) return { error: 'duplicate album category' };
      cats.add(it.category);
    }
    out.album = al;
  }

  if (patch.stories !== undefined) {
    const st = patch.stories;
    if (!Array.isArray(st) || st.length > STORIES_MAX) return { error: 'invalid stories' };
    const topics = new Set();
    for (const it of st) {
      if (!it || typeof it !== 'object' || !isStr(it.topic) || !it.topic ||
          !isStr(it.audioFileID) || !it.audioFileID) return { error: 'invalid story item' };
      if (topics.has(it.topic)) return { error: 'duplicate story topic' };
      topics.add(it.topic);
    }
    out.stories = st;
  }

  if (patch.tags !== undefined) {
    const tg = patch.tags;
    if (!tg || typeof tg !== 'object') return { error: 'invalid tags' };
    const nt = {};
    for (const k of Object.keys(tg)) {
      if (TAG_KEYS.indexOf(k) < 0) return { error: 'invalid tags key: ' + k };
      if (!isStrArray(tg[k], TAGS_PER_CATEGORY_MAX)) return { error: 'invalid tags.' + k };
      nt[k] = tg[k];
    }
    out.tags = nt;
  }

  const initNow = !lockedInit && !!(out.basic && out.basic.nickname && out.basic.gender && out.basic.birthday);
  return { patch: out, initNow };
}

async function updateProfileByOpenid(openid, patch, db) {
  const users = db.collection('users');
  const found = await users.where({ openid }).get();
  if (found.data.length === 0) return { error: 'user not found' };
  const user = found.data[0];

  const profiles = db.collection('profiles');
  const existingArr = await profiles.where({ openid }).get();
  const existing = existingArr.data[0] || {
    openid, userId: user._id, basicInit: false,
    basic: {}, about: {}, privacy: {}, album: [], stories: [], tags: {},
  };

  const sanitized = sanitizePatch(patch, existing);
  if (sanitized.error) return { error: sanitized.error };

  const merged = JSON.parse(JSON.stringify(existing));
  merged.openid = openid;
  merged.userId = user._id;
  Object.keys(sanitized.patch).forEach((k) => { merged[k] = sanitized.patch[k]; });
  if (sanitized.initNow) merged.basicInit = true;
  merged.updatedAt = new Date().toISOString();

  if (existingArr.data.length > 0) {
    await profiles.doc(existing._id).set({ data: merged });
  } else {
    await profiles.add({ data: merged });
  }
  return { profile: merged };
}

exports.main = async (event) => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const openid = cloud.getWXContext().OPENID;
  return updateProfileByOpenid(openid, (event || {}).patch, getDb());
};
exports.updateProfileByOpenid = updateProfileByOpenid;
```

`cloudfunctions/updateProfile/package.json`（name `updateProfile`，description「保存我的资料（白名单校验+锁定）」，其余同 Task 3 Step 5）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:integration -- updateProfile`
Expected: PASS（10 个用例）

- [ ] **Step 5: 全量回归 + 提交**

```bash
npm test
git add cloudfunctions/updateProfile tests/integration/updateProfile.test.js
git commit -m "feat(cloud): updateProfile 云函数（白名单校验+基本资料锁定）"
```

---

### Task 6: 云函数 `bindPhone`（可选手机号绑定）

**Files:**
- Create: `cloudfunctions/bindPhone/index.js`、`cloudfunctions/bindPhone/package.json`
- Test: `tests/integration/bindPhone.test.js`

**Interfaces:**
- Consumes: mock-db
- Produces: `main(event)`，`event = { code }`（`getPhoneNumber` 按钮 `e.detail.code`）→ `{ phone }` 或 `{ error }`；导出 `bindPhoneByOpenid(openid, code, db, openapi)`，`openapi = { phonenumber: { getPhoneNumber(args): Promise<{ phoneInfo: { phoneNumber } }> } }`。Task 8（auth.js）与 Task 14（编辑页）消费。部署后需**企业主体小程序**才能真实生效（规格 §2 决策 3）。

- [ ] **Step 1: 写失败测试**

```js
// tests/integration/bindPhone.test.js
const { createMockDb } = require('../helpers/mock-db.js');
const { bindPhoneByOpenid } = require('../../cloudfunctions/bindPhone/index.js');
const { loginWithOpenid } = require('../../cloudfunctions/login/index.js');

const okOpenapi = {
  phonenumber: { getPhoneNumber: async () => ({ phoneInfo: { phoneNumber: '13800000000' } }) },
};

describe('cloudfunctions/bindPhone', () => {
  test('用户不存在返回错误', async () => {
    const res = await bindPhoneByOpenid('openid-x', 'code', createMockDb(), okOpenapi);
    expect(res.error).toBe('user not found');
  });

  test('code 有效：写入 users.phone 并返回手机号', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const res = await bindPhoneByOpenid('openid-a', 'good-code', db, okOpenapi);
    expect(res.phone).toBe('13800000000');
    const users = await db.collection('users').where({ openid: 'openid-a' }).get();
    expect(users.data[0].phone).toBe('13800000000');
  });

  test('code 无效（openapi 抛错或无号码）返回错误', async () => {
    const db = createMockDb();
    await loginWithOpenid('openid-a', db);
    const badOpenapi = { phonenumber: { getPhoneNumber: async () => { throw new Error('bad code'); } } };
    expect((await bindPhoneByOpenid('openid-a', 'bad', db, badOpenapi)).error).toBe('phone code invalid');
    const emptyOpenapi = { phonenumber: { getPhoneNumber: async () => ({}) } };
    expect((await bindPhoneByOpenid('openid-a', 'bad', db, emptyOpenapi)).error).toBe('phone code invalid');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:integration -- bindPhone`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// bindPhone 云函数 —— 手机号可选绑定（企业主体能力）
// 前端 getPhoneNumber 按钮拿到 e.detail.code 后调用；openapi 解码并写入 users.phone。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

async function bindPhoneByOpenid(openid, code, db, openapi) {
  const users = db.collection('users');
  const found = await users.where({ openid }).get();
  if (found.data.length === 0) return { error: 'user not found' };
  let phone = '';
  try {
    const res = await openapi.phonenumber.getPhoneNumber({ code });
    phone = (res && res.phoneInfo && res.phoneInfo.phoneNumber) || '';
  } catch (e) {
    phone = '';
  }
  if (!phone) return { error: 'phone code invalid' };
  await users.doc(found.data[0]._id).update({ data: { phone } });
  return { phone };
}

exports.main = async (event) => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  return bindPhoneByOpenid(
    cloud.getWXContext().OPENID,
    (event || {}).code,
    getDb(),
    cloud.openapi
  );
};
exports.bindPhoneByOpenid = bindPhoneByOpenid;
```

`cloudfunctions/bindPhone/package.json`（name `bindPhone`，description「手机号可选绑定（getPhoneNumber code 解码）」，其余同 Task 3 Step 5）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:integration -- bindPhone`
Expected: PASS（3 个用例）

- [ ] **Step 5: 提交**

```bash
npm test
git add cloudfunctions/bindPhone tests/integration/bindPhone.test.js
git commit -m "feat(cloud): bindPhone 云函数（手机号可选绑定）"
```

---

### Task 7: 云函数 `deleteAccount`（注销）

**Files:**
- Create: `cloudfunctions/deleteAccount/index.js`、`cloudfunctions/deleteAccount/package.json`
- Test: `tests/integration/deleteAccount.test.js`

**Interfaces:**
- Consumes: mock-db
- Produces: `main()` → `{ deleted: boolean }`（无 error 分支）；导出 `deleteAccountByOpenid(openid, db)`。删除 `users` + `profiles` 文档。**已知限制（接受）**：云存储文件（头像/相册/语音）不级联删除，孤儿文件无泄露入口（fileID 不再被引用）。Task 19（设置页）消费。

- [ ] **Step 1: 写失败测试**

```js
// tests/integration/deleteAccount.test.js
const { createMockDb } = require('../helpers/mock-db.js');
const { deleteAccountByOpenid } = require('../../cloudfunctions/deleteAccount/index.js');

describe('cloudfunctions/deleteAccount', () => {
  test('删除 users 与 profiles 文档', async () => {
    const db = createMockDb({
      users: { u1: { _id: 'u1', openid: 'openid-a', role: 'normal', guestNo: 'J0001' } },
      profiles: { p1: { _id: 'p1', openid: 'openid-a', userId: 'u1' } },
    });
    const res = await deleteAccountByOpenid('openid-a', db);
    expect(res.deleted).toBe(true);
    expect((await db.collection('users').where({ openid: 'openid-a' }).get()).data).toHaveLength(0);
    expect((await db.collection('profiles').where({ openid: 'openid-a' }).get()).data).toHaveLength(0);
  });

  test('用户本就不存在时返回 deleted:false（幂等）', async () => {
    const res = await deleteAccountByOpenid('openid-none', createMockDb());
    expect(res.deleted).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:integration -- deleteAccount`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// deleteAccount 云函数 —— 注销账号（微信官方要求）
// 删除 users 与 profiles 文档；云存储文件不级联删除（P1 已知限制，见实现计划）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

async function deleteAccountByOpenid(openid, db) {
  const users = db.collection('users');
  const found = await users.where({ openid }).get();
  if (found.data.length === 0) return { deleted: false };
  await users.doc(found.data[0]._id).remove();
  const profiles = db.collection('profiles');
  const pf = await profiles.where({ openid }).get();
  if (pf.data.length > 0) {
    await profiles.doc(pf.data[0]._id).remove();
  }
  return { deleted: true };
}

exports.main = async () => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  return deleteAccountByOpenid(cloud.getWXContext().OPENID, getDb());
};
exports.deleteAccountByOpenid = deleteAccountByOpenid;
```

`cloudfunctions/deleteAccount/package.json`（name `deleteAccount`，description「注销账号：删除用户与资料文档」，其余同 Task 3 Step 5）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:integration -- deleteAccount`
Expected: PASS（2 个用例）

- [ ] **Step 5: 提交**

```bash
npm test
git add cloudfunctions/deleteAccount tests/integration/deleteAccount.test.js
git commit -m "feat(cloud): deleteAccount 云函数（注销删除账号数据）"
```

---

### Task 8: 登录态管理 `utils/auth.js`

**Files:**
- Create: `miniprogram/utils/auth.js`
- Modify: `tests/jest.setup.js`（补充 `wx.removeStorageSync`、`wx.cloud.uploadFile` 与全局 `getApp`）
- Test: `tests/unit/auth.test.js`

**Interfaces:**
- Consumes: `utils/request.js` 的 `callFunction(name, data)`（已有）；云函数 `login`（Task 3）、`bindPhone`（Task 6）
- Produces（Task 9/14/15/16/17/18/19 依赖）:
  - `ensureLogin(): Promise<UserVO|null>` — 有缓存立即返回缓存并后台静默刷新；无缓存发起登录；并发去重
  - `getCachedUser(): UserVO|null`
  - `clearLogin(): void` — 清缓存与 `globalData.user`
  - `bindPhoneWithCode(code: string): Promise<{phone}|null>`
  - 缓存 key `'j4l_user'`；登录态同时写入 `getApp().globalData.user`

- [ ] **Step 1: 扩展 `tests/jest.setup.js`**

在 `global.wx` 对象内追加两行（`cloud.uploadFile` 加入 cloud 对象；`removeStorageSync` 加入 wx 对象），并在文件末尾（`module.exports` 之前）追加 `getApp` 全局桩：

```js
// cloud 对象内追加：
  uploadFile: jest.fn(),
// wx 对象内追加：
  removeStorageSync: jest.fn(),
// 文件末尾追加：
// auth.js 等模块使用 getApp；单测默认桩，个别用例可覆盖 global.getApp
global.getApp = () => (global.__appStub = global.__appStub || { globalData: {} });
```

- [ ] **Step 2: 写失败测试**

```js
// tests/unit/auth.test.js —— 登录态管理
const auth = require('../../miniprogram/utils/auth.js');

const USER = { userId: 'u1', openid: 'ox', phone: '', role: 'normal', guestNo: 'J0001' };

function freshStorage() {
  wx.getStorageSync.mockReturnValue('');
  wx.setStorageSync.mockClear();
  wx.removeStorageSync.mockClear();
}
function loginResult(user) {
  wx.cloud.callFunction.mockResolvedValueOnce(
    user ? { result: { user, isNew: true } } : { result: null }
  );
}

beforeEach(() => {
  jest.resetModules(); // 每个用例重载 auth，清掉模块内 refreshing 去重状态
  freshStorage();
  global.__appStub = { globalData: {} };
  wx.cloud.callFunction.mockReset();
});

describe('utils/auth', () => {
  test('无缓存时 ensureLogin 调 login 云函数并写缓存与 globalData', async () => {
    loginResult(USER);
    const user = await require('../../miniprogram/utils/auth.js').ensureLogin();
    expect(user).toEqual(USER);
    expect(wx.cloud.callFunction).toHaveBeenCalledWith({ name: 'login', data: {} });
    expect(wx.setStorageSync).toHaveBeenCalledWith('j4l_user', USER);
    expect(global.getApp().globalData.user).toEqual(USER);
  });

  test('有缓存时 ensureLogin 立即返回缓存（不再发 login）', async () => {
    wx.getStorageSync.mockReturnValue(USER);
    const user = await require('../../miniprogram/utils/auth.js').ensureLogin();
    expect(user).toEqual(USER);
    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
  });

  test('login 失败（result null）返回 null 且不写缓存', async () => {
    loginResult(null);
    const user = await require('../../miniprogram/utils/auth.js').ensureLogin();
    expect(user).toBeNull();
    expect(wx.setStorageSync).not.toHaveBeenCalled();
  });

  test('clearLogin 清缓存与 globalData', () => {
    wx.getStorageSync.mockReturnValue(USER);
    global.getApp().globalData.user = USER;
    require('../../miniprogram/utils/auth.js').clearLogin();
    expect(wx.removeStorageSync).toHaveBeenCalledWith('j4l_user');
    expect(global.getApp().globalData.user).toBeNull();
  });

  test('bindPhoneWithCode 成功后回写缓存中的 phone', async () => {
    wx.getStorageSync.mockReturnValue(USER);
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { phone: '13800000000' } });
    const res = await require('../../miniprogram/utils/auth.js').bindPhoneWithCode('code1');
    expect(wx.cloud.callFunction).toHaveBeenCalledWith({ name: 'bindPhone', data: { code: 'code1' } });
    expect(res.phone).toBe('13800000000');
    const saved = wx.setStorageSync.mock.calls[0][1];
    expect(saved.phone).toBe('13800000000');
  });

  test('并发两次无缓存 ensureLogin 只发一次 login', async () => {
    loginResult(USER);
    const mod = require('../../miniprogram/utils/auth.js');
    const [a, b] = await Promise.all([mod.ensureLogin(), mod.ensureLogin()]);
    expect(a).toEqual(USER);
    expect(b).toEqual(USER);
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm run test:unit -- auth`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现**

```js
// utils/auth.js —— 登录态管理：本地缓存 + 启动恢复 + 静默登录/刷新 + 手机号绑定
const { callFunction } = require('./request.js');

const STORAGE_KEY = 'j4l_user';
let refreshing = null; // 并发去重

function getCachedUser() {
  try {
    const u = wx.getStorageSync(STORAGE_KEY);
    return u && u.userId ? u : null;
  } catch (e) {
    return null;
  }
}

function saveUser(user) {
  try {
    wx.setStorageSync(STORAGE_KEY, user);
  } catch (e) { /* 存储失败不阻断 */ }
  if (typeof getApp === 'function') {
    getApp().globalData.user = user;
  }
}

// 调 login 云函数（去重并发），成功写缓存与 globalData
function refreshLogin() {
  if (!refreshing) {
    refreshing = callFunction('login').then((res) => {
      refreshing = null;
      if (res && res.user) {
        saveUser(res.user);
        return res.user;
      }
      return null;
    });
  }
  return refreshing;
}

// 入口统一调用：有缓存立即返回缓存（云函数后台静默刷新由调用方 onShow 自行触发），
// 无缓存发起静默登录。失败返回 null，调用方保持「未登录」UI。
function ensureLogin() {
  const cached = getCachedUser();
  if (cached) {
    saveUser(cached);
    return Promise.resolve(cached);
  }
  return refreshLogin();
}

function clearLogin() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (e) { /* 忽略 */ }
  if (typeof getApp === 'function') {
    getApp().globalData.user = null;
  }
}

// getPhoneNumber 按钮 code → 手机号；成功后同步缓存
async function bindPhoneWithCode(code) {
  const res = await callFunction('bindPhone', { code });
  if (res && res.phone) {
    const u = getCachedUser();
    if (u) {
      u.phone = res.phone;
      saveUser(u);
    }
  }
  return res;
}

module.exports = { ensureLogin, getCachedUser, clearLogin, bindPhoneWithCode };
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test:unit -- auth`
Expected: PASS（6 个用例）

注意：`refreshLogin` 的 `then` 里 `refreshing = null` 写在 resolve 前，`request.js` 已把异常吞为 `null`，故无需 catch；若未来 request 改为抛错，需在此补 catch。

- [ ] **Step 6: 全量回归 + 提交**

```bash
npm test
git add miniprogram/utils/auth.js tests/unit/auth.test.js tests/jest.setup.js
git commit -m "feat(utils): 登录态管理 auth.js（缓存/静默登录/手机号绑定）"
```

---

### Task 9: 我的页接入登录态 + `app.js` 启动恢复

**Files:**
- Modify: `miniprogram/app.js`
- Modify: `miniprogram/pages/mine/mine.js`、`miniprogram/pages/mine/mine.wxml`、`miniprogram/pages/mine/mine.wxss`
- Test: 无新增（页面不单测，遵循仓库约定——逻辑已下沉 utils/auth.js 由 Task 8 覆盖；E2E 在 Task 20 验证）

**Interfaces:**
- Consumes: `auth.ensureLogin/getCachedUser`（Task 8）、`request.callFunction('getMyProfile')`（Task 4）
- Produces: `mine` 页 data：`user`（UserVO|null）、`profileSummary`（`{nickname, signature, avatarFileID}`|null）、`menus`（id→label 列表，本任务保持 `[edit, album, vip, settings]`，后续任务逐个把入口接通真实导航）；菜单点击仍走 `onTapMenu`，已接通的 id 走 `wx.navigateTo`，未接通的 toast「即将上线」。`globalData` 增加 `user` 字段（app.js 维护）。

- [ ] **Step 1: 修改 `miniprogram/app.js`**

```js
// app.js —— just4love 小程序入口
const { ensureLogin, getCachedUser } = require('./utils/auth.js');

App({
  onLaunch() {
    // 初始化云开发。
    // env 为占位环境 ID，创建云环境后在微信开发者工具 → 云开发 面板获取真实 env 并替换。
    if (wx.cloud) {
      wx.cloud.init({
        env: 'just4love-env',
        traceUser: true,
      });
    } else {
      console.warn('[just4love] 当前基础库不支持 wx.cloud，请升级微信开发者工具。');
    }

    // 登录态：先从本地缓存恢复（同步，立即可用），再后台静默登录/刷新
    const cached = getCachedUser();
    if (cached) {
      this.globalData.user = cached;
    }
    ensureLogin().then((user) => {
      if (user) {
        this.globalData.user = user;
      }
      this.globalData.loginReady = true;
    });
  },

  globalData: {
    // 登录态（UserVO）、登录完成标记；资料数据由各页面自行拉取
    user: null,
    loginReady: false,
  },
});
```

- [ ] **Step 2: 重写 `miniprogram/pages/mine/mine.js`**

```js
// pages/mine/mine.js —— 【我的】tab（登录态 + 资料概览 + 功能入口）
const { callFunction } = require('../../utils/request.js');
const { ensureLogin, getCachedUser } = require('../../utils/auth.js');

// 菜单入口：后续任务（14/15/16/17/18/19）逐个把 id 接通 navigateTo；
// 未接通的保持 toast 占位，避免指向不存在的页面。
const WIRED = {};

Page({
  data: {
    user: null,           // UserVO | null
    profileSummary: null, // { nickname, signature, avatarFileID }
    menus: [
      { id: 'edit', label: '编辑资料' },
      { id: 'album', label: '我的相册' },
      { id: 'vip', label: '会员中心' },
      { id: 'settings', label: '设置' },
    ],
  },

  async onShow() {
    const cached = getCachedUser();
    if (cached) this.setData({ user: cached });
    const user = await ensureLogin();
    if (user) this.setData({ user });
    const res = await callFunction('getMyProfile');
    if (res && res.profile && res.profile.basic) {
      const b = res.profile.basic;
      this.setData({
        profileSummary: {
          nickname: b.nickname || '',
          signature: b.signature || '',
          avatarFileID: b.avatarFileID || '',
        },
      });
    }
  },

  // 头像区点击：未登录 → 触发登录；已登录 → 进编辑资料（Task 14 接通）
  onTapProfile() {
    if (this.data.user) {
      this.navigateTo_('edit');
      return;
    }
    wx.showToast({ title: '登录中…', icon: 'none' });
    ensureLogin().then((u) => {
      if (u) {
        this.setData({ user: u });
      } else {
        wx.showToast({ title: '登录失败，请检查云环境配置', icon: 'none' });
      }
    });
  },

  onTapMenu(e) {
    const { id } = e.currentTarget.dataset;
    this.navigateTo_(id);
  },

  navigateTo_(id) {
    if (WIRED[id]) {
      wx.navigateTo({ url: WIRED[id] });
    } else {
      wx.showToast({ title: '即将上线', icon: 'none' });
    }
  },
});
```

- [ ] **Step 3: 重写 `miniprogram/pages/mine/mine.wxml`**

```xml
<view class="container mine">
  <view class="mine__profile card" bindtap="onTapProfile">
    <image
      class="mine__avatar"
      src="{{profileSummary.avatarFileID || '/assets/tabbar/mine.png'}}"
      mode="aspectFill"
    />
    <view class="mine__info">
      <view class="mine__name">{{profileSummary.nickname || (user ? user.guestNo : '点击登录')}}</view>
      <view class="mine__meta text-secondary">
        <text wx:if="{{user}}">{{user.guestNo}}</text>
        <text wx:elif="{{!user}}">微信一键登录，完善相亲资料</text>
      </view>
      <view wx:if="{{profileSummary.signature}}" class="mine__meta text-secondary">{{profileSummary.signature}}</view>
    </view>
  </view>

  <view class="mine__menus card">
    <view
      wx:for="{{menus}}"
      wx:key="id"
      class="mine__menu"
      data-id="{{item.id}}"
      bindtap="onTapMenu"
    >
      <text>{{item.label}}</text>
      <text class="mine__arrow text-secondary">›</text>
    </view>
  </view>
</view>
```

- [ ] **Step 4: `mine.wxss` 无需修改**

现有 `.mine__*` 样式已覆盖新结构（头像/昵称/两行 meta/菜单），本任务不改样式文件。

- [ ] **Step 5: 全量回归（不破坏既有测试）+ 提交**

Run: `npm test`
Expected: PASS

```bash
git add miniprogram/app.js miniprogram/pages/mine
git commit -m "feat(mine): 我的页接入登录态与资料概览"
```

---

### Task 10: `recommend-card` 重命名为 `profile-card`（纯重命名，不改行为）

**Files:**
- 重命名: `miniprogram/components/recommend-card/` → `miniprogram/components/profile-card/`（`git mv` 四个文件）
- Modify: `miniprogram/pages/recommend/recommend.json`、`recommend.wxml`、`recommend.js`
- Modify: `tests/unit/recommend-card.test.js` → `tests/unit/profile-card.test.js`（`git mv` + 更新路径与组件类名前缀）

**Interfaces:**
- Produces: 组件目录 `miniprogram/components/profile-card/`（index.js/json/wxml/wxss），本任务保持现有 props（`user`）与类名 `rc__*` **不变**——仅目录与引用重命名；Task 11 再切换到 `profile` props 与 `pc__*` 类名。对外事件不变（`tap`/`like`/`pass`）。

- [ ] **Step 1: git mv 组件与测试**

```bash
git mv miniprogram/components/recommend-card miniprogram/components/profile-card
git mv tests/unit/recommend-card.test.js tests/unit/profile-card.test.js
```

- [ ] **Step 2: 更新测试文件中的 load 路径与描述**

```js
// tests/unit/profile-card.test.js —— profile-card 组件单测（重命名自 recommend-card）
const simulate = require('miniprogram-simulate');
const path = require('path');

describe('components/profile-card', () => {
  let id;

  beforeAll(() => {
    id = simulate.load(
      path.resolve(__dirname, '../../miniprogram/components/profile-card/index')
    );
  });

  // 其余 4 个用例保持原内容不变（渲染昵称/年龄身高、缺身高、like 事件、pass 事件）
});
```

（仅改 `describe` 名与 `load` 路径，用例体不动。）

- [ ] **Step 3: 更新组件文件头注释**

`profile-card/index.js` 首行注释改为：`// components/profile-card/index.js —— 资料卡组件（P1 由 recommend-card 演进而来，纯展示）`

- [ ] **Step 4: 更新推荐页引用**

`miniprogram/pages/recommend/recommend.json`：

```json
{
  "navigationBarTitleText": "推荐",
  "usingComponents": {
    "profile-card": "/components/profile-card/index"
  }
}
```

`recommend.wxml` 中 `<recommend-card ...>` 标签改为 `<profile-card ...>`（属性与事件绑定不变）。

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test:unit -- profile-card`
Expected: PASS（4 个用例）

- [ ] **Step 6: 提交**

```bash
npm test
git add -A
git commit -m "refactor(component): recommend-card 更名 profile-card"
```

---

### Task 11: `profile-card` 信息区（头部 + 信息行 + 关于我/希望你 + 标签 + 家庭背景）

**Files:**
- Modify: `miniprogram/components/profile-card/index.js`、`index.wxml`、`index.wxss`
- Test: `tests/unit/profile-card.test.js`（重写用例）

**Interfaces:**
- Consumes: `utils/format.js` 的 `formatAge(birthYear)`（已有）；profiles 契约（计划头部）
- Produces: props 变更为 `profile: Object`（契约结构）、`showActions: Boolean`（默认 false，推荐页传 true 保留无感/心动按钮）、`verified: Boolean`（默认 false，「已实名/未实名」）。data 计算字段：`infoRows`（`[{label, value}]`，空值不出现）、`tagGroups`（`[{title, items}]`）、`familyText`、`storyList`、`albumList`、`verifiedText`。Task 12/18 依赖这些 props。**本任务 stories/album 区先不渲染**（Task 12 补）。

- [ ] **Step 1: 重写组件测试（失败测试）**

```js
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

function render(props) {
  const id = simulate.load(path.resolve(__dirname, '../../miniprogram/components/profile-card/index'));
  const comp = simulate.render(id, props);
  comp.attach(document.createElement('parent-wrapper'));
  return comp;
}

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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:unit -- profile-card`
Expected: FAIL（新 props 未实现）

- [ ] **Step 3: 重写 `profile-card/index.js`**

```js
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
    // onPlayStory / onPreviewAlbum 在 Task 12 加入
  },
});
```

- [ ] **Step 4: 重写 `profile-card/index.wxml`**

```xml
<view class="pc" bindtap="onTap">
  <!-- 头部：编号|实名 · 头像 · 签名 -->
  <view class="pc__head">
    <image class="pc__avatar" src="{{profile.basic.avatarFileID}}" mode="aspectFill" />
    <view class="pc__head-main">
      <view class="pc__no text-secondary">{{profile.basic.guestNo || ''}} {{verified ? '· 已实名' : '· 未实名'}}</view>
      <view wx:if="{{profile.basic.signature}}" class="pc__signature">{{profile.basic.signature}}</view>
    </view>
  </view>

  <!-- 信息行 -->
  <view class="pc__rows" wx:if="{{infoRows.length}}">
    <view class="pc__row" wx:for="{{infoRows}}" wx:key="label">
      <text class="pc__row-label text-secondary">{{item.label}}</text>
      <text class="pc__row-value">{{item.value}}</text>
    </view>
  </view>

  <view class="pc__section" wx:if="{{profile.about.aboutMe}}">
    <view class="pc__section-title">关于我</view>
    <view class="pc__section-body">{{profile.about.aboutMe}}</view>
  </view>

  <view class="pc__section" wx:if="{{profile.about.aboutYou}}">
    <view class="pc__section-title">希望你</view>
    <view class="pc__section-body">{{profile.about.aboutYou}}</view>
  </view>

  <view class="pc__section" wx:if="{{tagGroups.length}}">
    <view class="pc__section-title">我的标签</view>
    <view class="pc__chip-group" wx:for="{{tagGroups}}" wx:for-item="g" wx:key="title">
      <text class="pc__chip-label text-secondary">{{g.title}}</text>
      <text class="pc__chip" wx:for="{{g.items}}" wx:for-item="t" wx:key="*this">{{t}}</text>
    </view>
  </view>

  <view class="pc__section" wx:if="{{familyText}}">
    <view class="pc__section-title">家庭背景</view>
    <view class="pc__section-body">{{familyText}}</view>
  </view>

  <view class="pc__actions" wx:if="{{showActions}}">
    <view class="pc__btn pc__btn--pass" catchtap="onPass">无感</view>
    <view class="pc__btn pc__btn--like" catchtap="onLike">心动</view>
  </view>
</view>
```

- [ ] **Step 5: 重写 `profile-card/index.wxss`**

```css
/* profile-card —— 完整资料卡 */
.pc__head {
  display: flex;
  align-items: center;
}
.pc__avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: #eeeeee;
  flex-shrink: 0;
}
.pc__head-main {
  margin-left: 24rpx;
  flex: 1;
}
.pc__no {
  font-size: 24rpx;
}
.pc__signature {
  margin-top: 8rpx;
  font-size: 26rpx;
  color: var(--color-text-primary);
}
.pc__rows {
  margin-top: 24rpx;
  border-top: 1rpx solid #f0f0f0;
}
.pc__row {
  display: flex;
  padding: 14rpx 0;
  font-size: 26rpx;
}
.pc__row-label {
  width: 150rpx;
  flex-shrink: 0;
}
.pc__row-value {
  flex: 1;
}
.pc__section {
  margin-top: 24rpx;
  border-top: 1rpx solid #f0f0f0;
  padding-top: 20rpx;
}
.pc__section-title {
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 12rpx;
}
.pc__section-body {
  font-size: 26rpx;
  line-height: 1.6;
  color: #555555;
}
.pc__chip-group {
  margin-bottom: 12rpx;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
.pc__chip-label {
  font-size: 24rpx;
  margin-right: 12rpx;
}
.pc__chip {
  font-size: 24rpx;
  background: #fff1f1;
  color: var(--color-primary);
  border-radius: 24rpx;
  padding: 4rpx 18rpx;
  margin: 0 12rpx 8rpx 0;
}
.pc__actions {
  display: flex;
  margin-top: 24rpx;
}
.pc__btn {
  flex: 1;
  text-align: center;
  padding: 18rpx 0;
  border-radius: 40rpx;
  font-size: 28rpx;
}
.pc__btn--pass {
  background: #f5f5f5;
  color: #666666;
  margin-right: 24rpx;
}
.pc__btn--like {
  background: var(--color-primary);
  color: #ffffff;
}
```

- [ ] **Step 6: 更新推荐页为新 props（沿用旧 mock 数据形状的最小改动）**

`miniprogram/pages/recommend/recommend.js` 的 mock 数据改为契约结构的最小子集：

```js
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
```

`recommend.wxml` 标签属性改为：

```xml
<profile-card
  wx:for="{{list}}"
  wx:key="index"
  profile="{{item}}"
  show-actions
  bind:like="onLike"
  bind:pass="onPass"
/>
```

- [ ] **Step 7: 跑测试确认通过**

Run: `npm run test:unit -- profile-card`
Expected: PASS（5 个用例）

- [ ] **Step 8: 全量回归 + 提交**

```bash
npm test
git add miniprogram/components/profile-card miniprogram/pages/recommend tests/unit/profile-card.test.js
git commit -m "feat(component): 资料卡信息区（头部/信息行/关于我/标签/家庭背景）"
```

---

### Task 12: `profile-card` 相册区 + 故事区（语音播放）

**Files:**
- Modify: `miniprogram/components/profile-card/index.js`、`index.wxml`、`index.wxss`
- Modify: `tests/jest.setup.js`（`wx.createInnerAudioContext`、`wx.previewImage` mock）
- Test: `tests/unit/profile-card.test.js`（追加用例）

**Interfaces:**
- Consumes: `albumList`/`storyList`（Task 11 已在 data 计算好）
- Produces: 组件方法 `onPlayStory(e)`（`e.currentTarget.dataset.index`；单一 `_audio` 实例，切换播放/停止，data.playingIndex 高亮）、`onPreviewAlbum(e)`（`wx.previewImage` 全册浏览）；`detached` 生命周期销毁音频。Task 18（预览页）消费。

- [ ] **Step 1: 扩展 `tests/jest.setup.js`**

`wx` 对象内追加：

```js
  previewImage: jest.fn(),
  createInnerAudioContext: jest.fn(() => ({
    src: '', play: jest.fn(), stop: jest.fn(), destroy: jest.fn(),
  })),
```

- [ ] **Step 2: 追加失败测试**

在 `tests/unit/profile-card.test.js` 末尾追加：

```js
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
    wx.createInnerAudioContext.mockReturnValueOnce(audio).mockReturnValueOnce(audio);
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
    comp.instance.detached();
    expect(audio.destroy).toHaveBeenCalled();
  });
});
```

（`render` 复用 Task 11 Step 1 定义的辅助函数——将它在两个 describe 间提升为文件级函数。）

- [ ] **Step 3: 跑测试确认失败**

Run: `npm run test:unit -- profile-card`
Expected: 新增 4 个用例 FAIL

- [ ] **Step 4: 实现组件方法与生命周期**

`index.js` 的 `methods` 补齐（替换 Task 11 中的占位注释），并在 `methods` 前加 `lifetimes`：

```js
  lifetimes: {
    detached() {
      if (this._audio) {
        this._audio.destroy();
        this._audio = null;
      }
    },
  },
  methods: {
    onTap() { this.triggerEvent('tap', { profile: this.data.profile }); },
    onLike() { this.triggerEvent('like', { profile: this.data.profile }); },
    onPass() { this.triggerEvent('pass', { profile: this.data.profile }); },

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
      this._audio.stop();
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
```

- [ ] **Step 5: wxml 修改两处**

（a）头部追加「播放语音介绍」按钮（规格 §4.4：上侧含语音播放，播放第 1 条故事；仅当 `playingIndex === 0` 时显示停止态）——插在 `.pc__head-main` 内、`.pc__signature` 之后：

```xml
      <view
        wx:if="{{storyList.length}}"
        class="pc__voice text-primary"
        catchtap="onPlayStory"
        data-index="{{0}}"
      >{{playingIndex === 0 ? '■ 停止语音介绍' : '▶ 播放语音介绍'}}</view>
```

（b）「我的生活」「我的故事」两个区块插在「家庭背景」区块之后、actions 之前：

```xml
  <view class="pc__section" wx:if="{{albumList.length}}">
    <view class="pc__section-title">我的生活</view>
    <view class="pc__album">
      <view class="pc__album-item" wx:for="{{albumList}}" wx:key="category">
        <image class="pc__album-img" src="{{item.fileID}}" mode="aspectFill"
               catchtap="onPreviewAlbum" data-index="{{index}}" />
        <text class="pc__album-cat text-secondary">{{item.category}}</text>
      </view>
    </view>
  </view>

  <view class="pc__section" wx:if="{{storyList.length}}">
    <view class="pc__section-title">我的故事</view>
    <view class="pc__story" wx:for="{{storyList}}" wx:key="topic">
      <text class="pc__story-topic"># {{item.topic}}</text>
      <text
        class="pc__story-play {{playingIndex === index ? 'pc__story-play--on' : ''}}"
        catchtap="onPlayStory"
        data-index="{{index}}"
      >{{playingIndex === index ? '■ 停止' : '▶ 播放'}}</text>
    </view>
  </view>
```

- [ ] **Step 6: wxss 追加样式**

```css
.pc__voice {
  margin-top: 10rpx;
  font-size: 24rpx;
}
.pc__album {
  display: flex;
  flex-wrap: wrap;
}
.pc__album-item {
  width: 33.3%;
  padding: 0 8rpx 16rpx 0;
  box-sizing: border-box;
}
.pc__album-img {
  width: 100%;
  height: 180rpx;
  border-radius: 12rpx;
  background: #eeeeee;
  display: block;
}
.pc__album-cat {
  font-size: 22rpx;
  display: block;
  margin-top: 6rpx;
}
.pc__story {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}
.pc__story:last-child {
  border-bottom: none;
}
.pc__story-topic {
  font-size: 26rpx;
}
.pc__story-play {
  font-size: 24rpx;
  color: var(--color-primary);
}
```

- [ ] **Step 7: 跑测试确认通过 + 全量回归**

Run: `npm run test:unit -- profile-card`，然后 `npm test`
Expected: PASS（9 个用例）

- [ ] **Step 8: 提交**

```bash
git add miniprogram/components/profile-card tests/unit/profile-card.test.js tests/jest.setup.js
git commit -m "feat(component): 资料卡相册与故事区（语音播放/照片预览）"
```

---

### Task 13: 云存储直传 `utils/upload.js`

**Files:**
- Create: `miniprogram/utils/upload.js`
- Test: `tests/unit/upload.test.js`

**Interfaces:**
- Produces（Task 14/15/16 依赖）:
  - `uploadFile(cloudPath, filePath): Promise<string|null>` — 底层直传，返回 fileID 或 null
  - `uploadImage(prefix, filePath): Promise<string|null>` — `prefix` 形如 `'avatars/u1'`，自动生成 `{prefix}/{时间戳}-{随机6}.{ext}`
  - `uploadAudio(prefix, filePath): Promise<string|null>` — 同上（录音格式 mp3）
  - 扩展名取自 `filePath` 后缀（无后缀时 image→`jpg`、audio→`mp3`）

- [ ] **Step 1: 写失败测试**

```js
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
    wx.cloud.uploadFile.mockRejectedValueOnce(new Error('quota'));
    expect(await uploadFile('a/b.jpg', 'wxfile://tmp/1.jpg')).toBeNull();
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:unit -- upload`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:unit -- upload`
Expected: PASS（4 个用例）

- [ ] **Step 5: 全量回归 + 提交**

```bash
npm test
git add miniprogram/utils/upload.js tests/unit/upload.test.js
git commit -m "feat(utils): 云存储直传封装"
```

---

### Task 14: 资料编辑页 `pages/profile-edit`（基本资料 + 相亲信息 + 隐私字段）

**Files:**
- Create: `miniprogram/pages/profile-edit/profile-edit.{js,json,wxml,wxss}`
- Modify: `miniprogram/app.json`（注册页面）
- Modify: `miniprogram/pages/mine/mine.js`（接通 `edit` 菜单）

**Interfaces:**
- Consumes: `auth.ensureLogin/bindPhoneWithCode`（Task 8）、`request.callFunction('getMyProfile'/'updateProfile')`（Task 4/5）、`profile.createEmptyProfile/validateProfileDraft`（Task 2）、`constellation.getConstellation`（Task 1）、`upload.uploadImage`（Task 13）、`options.*`（Task 2）
- Produces: 页面 data：`draft`（契约结构）、`avatarPreview`、`saving`、选项池数组、`today`、`fbMap`（家庭背景选中态映射，WXML 无法调 `indexOf`）。保存流程：头像临时路径先 `uploadImage` 得 fileID，再整体 `updateProfile({ patch: {basic, about, privacy, album, stories, tags} })`。

**页面不写单测**（仓库约定），表单逻辑由 Task 2 `validateProfileDraft` 与 Task 5 云函数校验覆盖；E2E 在 Task 20 验证页面结构与选项池。

- [ ] **Step 1: 注册页面**

`miniprogram/app.json` 的 `pages` 数组追加：

```json
    "pages/profile-edit/profile-edit",
```

- [ ] **Step 2: 新建 `profile-edit.json`**

```json
{
  "navigationBarTitleText": "编辑资料",
  "usingComponents": {}
}
```

- [ ] **Step 3: 新建 `profile-edit.js`**

```js
// pages/profile-edit/profile-edit.js —— 资料编辑（基本资料 + 相亲信息 + 隐私字段）
// 相册/故事/标签在独立页面维护，本页草稿中的对应段随保存原样回传。
const { callFunction } = require('../../utils/request.js');
const { ensureLogin, bindPhoneWithCode } = require('../../utils/auth.js');
const { createEmptyProfile, validateProfileDraft } = require('../../utils/profile.js');
const { getConstellation } = require('../../utils/constellation.js');
const { uploadImage } = require('../../utils/upload.js');
const {
  LOVE_GOALS, EMOTIONAL_STATUS, FAMILY_BACKGROUND, HABITS, EDUCATIONS, JOBS,
} = require('../../utils/options.js');

const HEIGHT_RANGE = [];
for (let h = 140; h <= 210; h++) HEIGHT_RANGE.push(h);

Page({
  data: {
    draft: null,
    avatarPreview: '',
    saving: false,
    today: '',
    genders: ['男', '女'],
    loveGoals: LOVE_GOALS,
    emotionalStatus: EMOTIONAL_STATUS,
    familyBackground: FAMILY_BACKGROUND,
    habits: HABITS,
    educations: EDUCATIONS,
    jobs: JOBS,
    heightRange: HEIGHT_RANGE,
    fbMap: {}, // 家庭背景选中态：{ '独生子女': true }（WXML 不能调 indexOf，用映射）
  },

  async onLoad() {
    const now = new Date();
    this.setData({
      today: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'),
    });
    const user = await ensureLogin();
    const res = await callFunction('getMyProfile');
    const profile = (res && res.profile) || createEmptyProfile(user);
    // 云端旧资料可能缺新字段，用空模板补齐结构
    const template = createEmptyProfile(user);
    const draft = { ...template, ...profile, basic: { ...template.basic, ...(profile.basic || {}) },
      about: { ...template.about, ...(profile.about || {}) },
      privacy: {
        asset: { ...template.privacy.asset, ...((profile.privacy || {}).asset || {}) },
        contact: { ...template.privacy.contact, ...((profile.privacy || {}).contact || {}) },
      },
      tags: { ...template.tags, ...(profile.tags || {}) } };
    this.setData({
      draft,
      avatarPreview: draft.basic.avatarFileID || '',
      fbMap: this.buildFbMap(draft.about.familyBackground),
    });
  },

  buildFbMap(list) {
    const map = {};
    (list || []).forEach((x) => { map[x] = true; });
    return map;
  },

  // 头像：chooseAvatar 得到本地临时路径，保存时才上传
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail || {};
    if (!avatarUrl) return;
    this._pendingAvatarPath = avatarUrl;
    this.setData({ avatarPreview: avatarUrl });
  },

  // 通用输入：data-path 如 "basic.nickname"
  onInput(e) {
    const { path } = e.currentTarget.dataset;
    this.setData({ ['draft.' + path]: e.detail.value });
  },

  onPickGender(e) {
    this.setData({ 'draft.basic.gender': this.data.genders[Number(e.detail.value)] });
  },

  onPickBirthday(e) {
    const birthday = e.detail.value;
    this.setData({
      'draft.basic.birthday': birthday,
      'draft.basic.constellation': getConstellation(birthday),
    });
  },

  // 通用单选 picker：data-field 如 "about.loveGoal"，data-options 如 "loveGoals"
  onPickOption(e) {
    const { field, options: optionsKey } = e.currentTarget.dataset;
    const value = this.data[optionsKey][Number(e.detail.value)];
    this.setData({ ['draft.' + field]: value });
  },

  onPickHeight(e) {
    this.setData({ 'draft.about.height': HEIGHT_RANGE[Number(e.detail.value)] });
  },

  // 省市选择（region picker 返回 [省, 市, 区]，只取省市）
  onRegion(e) {
    const { field } = e.currentTarget.dataset;
    const [province, city] = e.detail.value;
    this.setData({ ['draft.' + field]: province + ' ' + city });
  },

  onToggleFamily(e) {
    const { item } = e.currentTarget.dataset;
    const list = (this.data.draft.about.familyBackground || []).slice();
    const idx = list.indexOf(item);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(item);
    }
    this.setData({ 'draft.about.familyBackground': list, fbMap: this.buildFbMap(list) });
  },

  // 吸烟/喝酒/打牌：data-field="about.smoke" 等
  onPickHabit(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ ['draft.' + field]: HABITS[Number(e.detail.value)] });
  },

  // getPhoneNumber 按钮：code → 云函数解码 → 回填
  async onGetPhone(e) {
    const { code } = e.detail || {};
    if (!code) return;
    const res = await bindPhoneWithCode(code);
    if (res && res.phone) {
      this.setData({ 'draft.privacy.contact.phone': res.phone });
      wx.showToast({ title: '已获取手机号', icon: 'success' });
    } else {
      wx.showToast({ title: '获取手机号失败', icon: 'none' });
    }
  },

  async onSave() {
    if (this.data.saving || !this.data.draft) return;
    const check = validateProfileDraft(this.data.draft);
    if (!check.ok) {
      wx.showToast({ title: check.message, icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      const patch = {};
      ['basic', 'about', 'privacy', 'album', 'stories', 'tags'].forEach((k) => {
        patch[k] = this.data.draft[k];
      });
      // 待上传头像：先传云存储
      if (this._pendingAvatarPath) {
        const fileID = await uploadImage(
          'avatars/' + (this.data.draft.userId || 'unknown'),
          this._pendingAvatarPath
        );
        if (fileID) patch.basic = { ...patch.basic, avatarFileID: fileID };
      }
      const res = await callFunction('updateProfile', { patch });
      if (res && res.profile) {
        this._pendingAvatarPath = null;
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack({ fail: () => {} }), 600);
      } else {
        wx.showToast({ title: (res && res.error) || '保存失败', icon: 'none' });
      }
    } finally {
      this.setData({ saving: false });
    }
  },
});
```

- [ ] **Step 4: 新建 `profile-edit.wxml`**

```xml
<view class="container edit" wx:if="{{draft}}">
  <!-- 基本资料 -->
  <view class="card">
    <view class="edit__title">基本资料</view>

    <view class="edit__row">
      <text class="edit__label">头像</text>
      <button class="edit__avatar-btn" open-type="chooseAvatar" bindchooseavatar="onChooseAvatar">
        <image class="edit__avatar" src="{{avatarPreview}}" mode="aspectFill" />
      </button>
      <text class="text-secondary edit__hint">请使用本人真人照片</text>
    </view>

    <view class="edit__row">
      <text class="edit__label">嘉宾编号</text>
      <text class="text-secondary">{{draft.basic.guestNo || '注册后自动生成'}}</text>
    </view>

    <view class="edit__row">
      <text class="edit__label">昵称</text>
      <input class="edit__input" type="nickname" maxlength="20"
             value="{{draft.basic.nickname}}" disabled="{{draft.basicInit}}"
             bindinput="onInput" data-path="basic.nickname" placeholder="请输入昵称" />
    </view>

    <picker range="{{genders}}" disabled="{{draft.basicInit}}" bindchange="onPickGender">
      <view class="edit__row">
        <text class="edit__label">性别</text>
        <text class="{{draft.basic.gender ? '' : 'text-secondary'}}">{{draft.basic.gender || '请选择'}}</text>
        <text class="edit__arrow text-secondary">›</text>
      </view>
    </picker>

    <picker mode="date" end="{{today}}" value="{{draft.basic.birthday}}"
            disabled="{{draft.basicInit}}" bindchange="onPickBirthday">
      <view class="edit__row">
        <text class="edit__label">生日</text>
        <text class="{{draft.basic.birthday ? '' : 'text-secondary'}}">
          {{draft.basic.birthday || '请选择'}}{{draft.basic.constellation ? '（' + draft.basic.constellation + '）' : ''}}
        </text>
        <text class="edit__arrow text-secondary">›</text>
      </view>
    </picker>

    <view class="edit__row">
      <text class="edit__label">个性签名</text>
      <input class="edit__input" maxlength="50" value="{{draft.basic.signature}}"
             bindinput="onInput" data-path="basic.signature" placeholder="一句话介绍自己" />
    </view>
    <view wx:if="{{draft.basicInit}}" class="edit__lock text-secondary">昵称/性别/生日注册后不可修改</view>
  </view>

  <!-- 相亲信息 -->
  <view class="card edit__card">
    <view class="edit__title">相亲信息</view>

    <view class="edit__row"><text class="edit__label">关于我</text></view>
    <textarea class="edit__textarea" maxlength="500" value="{{draft.about.aboutMe}}"
              bindinput="onInput" data-path="about.aboutMe" placeholder="介绍你的性格、经历、生活状态…" />
    <view class="edit__row"><text class="edit__label">希望你</text></view>
    <textarea class="edit__textarea" maxlength="500" value="{{draft.about.aboutYou}}"
              bindinput="onInput" data-path="about.aboutYou" placeholder="描述你期待的另一半…" />

    <picker range="{{loveGoals}}" bindchange="onPickOption" data-field="about.loveGoal" data-options="loveGoals">
      <view class="edit__row">
        <text class="edit__label">恋爱目标</text>
        <text class="{{draft.about.loveGoal ? '' : 'text-secondary'}}">{{draft.about.loveGoal || '请选择'}}</text>
        <text class="edit__arrow text-secondary">›</text>
      </view>
    </picker>

    <picker range="{{emotionalStatus}}" bindchange="onPickOption" data-field="about.emotionalStatus" data-options="emotionalStatus">
      <view class="edit__row">
        <text class="edit__label">情感状态</text>
        <text class="{{draft.about.emotionalStatus ? '' : 'text-secondary'}}">{{draft.about.emotionalStatus || '请选择'}}</text>
        <text class="edit__arrow text-secondary">›</text>
      </view>
    </picker>

    <picker range="{{heightRange}}" value="{{draft.about.height - 140}}" bindchange="onPickHeight">
      <view class="edit__row">
        <text class="edit__label">身高</text>
        <text class="{{draft.about.height ? '' : 'text-secondary'}}">{{draft.about.height ? draft.about.height + 'cm' : '请选择'}}</text>
        <text class="edit__arrow text-secondary">›</text>
      </view>
    </picker>

    <picker range="{{educations}}" bindchange="onPickOption" data-field="about.education" data-options="educations">
      <view class="edit__row">
        <text class="edit__label">学历</text>
        <text class="{{draft.about.education ? '' : 'text-secondary'}}">{{draft.about.education || '请选择'}}</text>
        <text class="edit__arrow text-secondary">›</text>
      </view>
    </picker>

    <picker range="{{jobs}}" bindchange="onPickOption" data-field="about.job" data-options="jobs">
      <view class="edit__row">
        <text class="edit__label">职业</text>
        <text class="{{draft.about.job ? '' : 'text-secondary'}}">{{draft.about.job || '请选择'}}</text>
        <text class="edit__arrow text-secondary">›</text>
      </view>
    </picker>

    <picker mode="region" bindchange="onRegion" data-field="about.city">
      <view class="edit__row">
        <text class="edit__label">现居地</text>
        <text class="{{draft.about.city ? '' : 'text-secondary'}}">{{draft.about.city || '请选择'}}</text>
        <text class="edit__arrow text-secondary">›</text>
      </view>
    </picker>

    <picker mode="region" bindchange="onRegion" data-field="about.hometown">
      <view class="edit__row">
        <text class="edit__label">家乡</text>
        <text class="{{draft.about.hometown ? '' : 'text-secondary'}}">{{draft.about.hometown || '请选择'}}</text>
        <text class="edit__arrow text-secondary">›</text>
      </view>
    </picker>

    <view class="edit__row">
      <text class="edit__label">学校</text>
      <input class="edit__input" maxlength="20" value="{{draft.about.school}}"
             bindinput="onInput" data-path="about.school" placeholder="最高学历院校" />
    </view>

    <view class="edit__row edit__row--column">
      <text class="edit__label">家庭背景（可多选）</text>
      <view class="edit__chips">
        <text
          wx:for="{{familyBackground}}"
          wx:key="*this"
          class="edit__chip {{fbMap[item] ? 'edit__chip--on' : ''}}"
          data-item="{{item}}"
          bindtap="onToggleFamily"
        >{{item}}</text>
      </view>
    </view>
  </view>

  <!-- 吸烟/喝酒/打牌：三个独立 picker -->
  <view class="card edit__card">
    <picker range="{{habits}}" bindchange="onPickHabit" data-field="about.smoke">
      <view class="edit__row">
        <text class="edit__label">吸烟</text>
        <text class="{{draft.about.smoke ? '' : 'text-secondary'}}">{{draft.about.smoke || '请选择'}}</text>
        <text class="edit__arrow text-secondary">›</text>
      </view>
    </picker>
    <picker range="{{habits}}" bindchange="onPickHabit" data-field="about.drink">
      <view class="edit__row">
        <text class="edit__label">喝酒</text>
        <text class="{{draft.about.drink ? '' : 'text-secondary'}}">{{draft.about.drink || '请选择'}}</text>
        <text class="edit__arrow text-secondary">›</text>
      </view>
    </picker>
    <picker range="{{habits}}" bindchange="onPickHabit" data-field="about.gamble">
      <view class="edit__row">
        <text class="edit__label">打牌</text>
        <text class="{{draft.about.gamble ? '' : 'text-secondary'}}">{{draft.about.gamble || '请选择'}}</text>
        <text class="edit__arrow text-secondary">›</text>
      </view>
    </picker>
  </view>

  <!-- 隐私字段 -->
  <view class="card edit__card">
    <view class="edit__title">隐私信息 <text class="text-secondary edit__hint">保存后默认对他人隐藏</text></view>
    <view class="edit__row">
      <text class="edit__label">房产</text>
      <input class="edit__input" maxlength="20" value="{{draft.privacy.asset.house}}"
             bindinput="onInput" data-path="privacy.asset.house" placeholder="如：有房无贷" />
    </view>
    <view class="edit__row">
      <text class="edit__label">车辆</text>
      <input class="edit__input" maxlength="20" value="{{draft.privacy.asset.car}}"
             bindinput="onInput" data-path="privacy.asset.car" placeholder="如：有车" />
    </view>
    <view class="edit__row">
      <text class="edit__label">收入</text>
      <input class="edit__input" maxlength="20" value="{{draft.privacy.asset.income}}"
             bindinput="onInput" data-path="privacy.asset.income" placeholder="如：20-30万/年" />
    </view>
    <view class="edit__row">
      <text class="edit__label">联系电话</text>
      <input class="edit__input edit__input--phone" type="number" maxlength="11"
             value="{{draft.privacy.contact.phone}}"
             bindinput="onInput" data-path="privacy.contact.phone" placeholder="手机号" />
      <button class="edit__mini-btn" size="mini" open-type="getPhoneNumber"
              bindgetphonenumber="onGetPhone">微信获取</button>
    </view>
    <view class="edit__row">
      <text class="edit__label">微信号</text>
      <input class="edit__input" maxlength="30" value="{{draft.privacy.contact.wechat}}"
             bindinput="onInput" data-path="privacy.contact.wechat" placeholder="微信号" />
    </view>
  </view>

  <button class="edit__save {{saving ? 'edit__save--loading' : ''}}" bindtap="onSave"
          disabled="{{saving}}">{{saving ? '保存中…' : '保存'}}</button>
</view>
```

- [ ] **Step 5: 新建 `profile-edit.wxss`**

```css
/* profile-edit —— 资料编辑 */
.edit__card {
  margin-top: 24rpx;
}
.edit__title {
  font-size: 30rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
}
.edit__row {
  display: flex;
  align-items: center;
  padding: 22rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}
.edit__row:last-child {
  border-bottom: none;
}
.edit__row--column {
  flex-direction: column;
  align-items: flex-start;
}
.edit__label {
  width: 160rpx;
  flex-shrink: 0;
  font-size: 28rpx;
}
.edit__input {
  flex: 1;
  font-size: 28rpx;
}
.edit__input--phone {
  flex: 1;
  min-width: 0;
}
.edit__textarea {
  width: 100%;
  min-height: 140rpx;
  font-size: 26rpx;
  padding: 16rpx;
  box-sizing: border-box;
  background: #fafafa;
  border-radius: 12rpx;
  margin-bottom: 8rpx;
}
.edit__hint {
  font-size: 22rpx;
  margin-left: 12rpx;
}
.edit__lock {
  font-size: 22rpx;
  padding-top: 12rpx;
}
.edit__arrow {
  margin-left: auto;
  font-size: 30rpx;
}
.edit__avatar-btn {
  padding: 0;
  margin: 0;
  background: none;
  line-height: 1;
  width: 100rpx;
}
.edit__avatar-btn::after {
  border: none;
}
.edit__avatar {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background: #eeeeee;
}
.edit__chips {
  display: flex;
  flex-wrap: wrap;
  margin-top: 16rpx;
}
.edit__chip {
  font-size: 24rpx;
  padding: 8rpx 20rpx;
  border-radius: 26rpx;
  background: #f5f5f5;
  color: #666666;
  margin: 0 16rpx 16rpx 0;
}
.edit__chip--on {
  background: #fff1f1;
  color: var(--color-primary);
}
.edit__mini-btn {
  margin-left: 16rpx;
  flex-shrink: 0;
  background: var(--color-primary);
  color: #ffffff;
  font-size: 22rpx;
}
.edit__save {
  margin-top: 32rpx;
  background: var(--color-primary);
  color: #ffffff;
  border-radius: 44rpx;
}
.edit__save--loading {
  opacity: 0.6;
}
```

- [ ] **Step 6: 接通我的页菜单**

`miniprogram/pages/mine/mine.js`：`WIRED` 改为

```js
const WIRED = {
  edit: '/pages/profile-edit/profile-edit',
};
```

同时 `menus` 中删除 `{ id: 'vip', label: '会员中心' }`（P1 无会员体系），列表变为 `edit/album/settings`。

- [ ] **Step 7: 全量回归 + 提交**

Run: `npm test`
Expected: PASS

```bash
git add miniprogram/pages/profile-edit miniprogram/app.json miniprogram/pages/mine/mine.js
git commit -m "feat(page): 资料编辑页（基本资料/相亲信息/隐私字段）"
```

---

### Task 15: 相册编辑页 `pages/album-edit`（5 分类照片）

**Files:**
- Create: `miniprogram/pages/album-edit/album-edit.{js,json,wxml,wxss}`
- Modify: `miniprogram/app.json`、`miniprogram/pages/mine/mine.js`（接通 `album` 菜单）

**Interfaces:**
- Consumes: `auth.ensureLogin/getCachedUser`、`request.callFunction('getMyProfile'/'updateProfile')`、`upload.uploadImage`、`options.ALBUM_CATEGORIES`、`LIMITS.ALBUM_MAX`
- Produces: 页面 data：`album`（`[{category, fileID}]`）、`slots`（按 5 分类预排的展示槽位，含空槽，WXML 不做查找逻辑）、`userId`。每张照片选择→上传→立即整段保存 `updateProfile({patch:{album}})`（无统一保存按钮）。

- [ ] **Step 1: 注册页面 + json**

`app.json` 的 `pages` 追加 `"pages/album-edit/album-edit",`；`album-edit.json`：

```json
{
  "navigationBarTitleText": "我的相册",
  "usingComponents": {}
}
```

- [ ] **Step 2: 新建 `album-edit.js`**

```js
// pages/album-edit/album-edit.js —— 5 分类照片：选图→上传云存储→即时保存
// slots 为按 5 个分类预排的展示槽位（含空槽），WXML 不做查找逻辑。
const { callFunction } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { uploadImage } = require('../../utils/upload.js');
const { ALBUM_CATEGORIES } = require('../../utils/options.js');

Page({
  data: {
    album: [],   // [{category, fileID}]
    slots: [],   // [{category, fileID:''}]
    userId: '',
  },

  async onLoad() {
    const user = await ensureLogin();
    this.setData({ userId: (user && user.userId) || '' });
    const res = await callFunction('getMyProfile');
    const album = (res && res.profile && res.profile.album) || [];
    this.setData({ album, slots: this.buildSlots(album) });
  },

  buildSlots(album) {
    return ALBUM_CATEGORIES.map((category) => {
      const hit = album.find((a) => a.category === category);
      return { category, fileID: hit ? hit.fileID : '' };
    });
  },

  updateAlbum(album) {
    this.setData({ album, slots: this.buildSlots(album) });
  },

  // 点空槽「上传」或「更换」：选图 → 上传 → 整段保存
  async onChoose(e) {
    const { category } = e.currentTarget.dataset;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (r) => {
        const tempPath = r.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中' });
        const fileID = await uploadImage('album/' + (this.data.userId || 'unknown'), tempPath);
        wx.hideLoading();
        if (!fileID) {
          wx.showToast({ title: '上传失败', icon: 'none' });
          return;
        }
        const album = this.data.album.filter((a) => a.category !== category);
        album.push({ category, fileID });
        this.updateAlbum(album);
        await this.persist(album);
      },
    });
  },

  onPreview(e) {
    const { category } = e.currentTarget.dataset;
    const item = this.data.album.find((a) => a.category === category);
    if (!item) return;
    wx.previewImage({ current: item.fileID, urls: this.data.album.map((a) => a.fileID) });
  },

  async onRemove(e) {
    const { category } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除照片',
      content: '确定删除「' + category + '」的照片吗？',
      success: async (r) => {
        if (!r.confirm) return;
        const album = this.data.album.filter((a) => a.category !== category);
        this.updateAlbum(album);
        await this.persist(album);
      },
    });
  },

  async persist(album) {
    const res = await callFunction('updateProfile', { patch: { album } });
    if (res && res.profile) {
      wx.showToast({ title: '已保存', icon: 'success' });
    } else {
      wx.showToast({ title: (res && res.error) || '保存失败', icon: 'none' });
    }
  },
});
```

- [ ] **Step 3: 新建 `album-edit.wxml`**

```xml
<view class="container album">
  <view class="text-secondary album__tip">每个分类上传一张照片，共 5 张</view>
  <view class="card">
    <view class="album__row" wx:for="{{slots}}" wx:key="category">
      <text class="album__cat">{{item.category}}</text>
      <view class="album__ops">
        <image wx:if="{{item.fileID}}" class="album__thumb" src="{{item.fileID}}"
               mode="aspectFill" bindtap="onPreview" data-category="{{item.category}}" />
        <text wx:else class="album__empty text-secondary" bindtap="onChoose"
              data-category="{{item.category}}">＋ 上传</text>
        <text wx:if="{{item.fileID}}" class="album__op text-primary" bindtap="onChoose"
              data-category="{{item.category}}">更换</text>
        <text wx:if="{{item.fileID}}" class="album__op text-secondary" bindtap="onRemove"
              data-category="{{item.category}}">删除</text>
      </view>
    </view>
  </view>
</view>
```

- [ ] **Step 4: 新建 `album-edit.wxss`**

```css
.album__tip {
  font-size: 24rpx;
  margin-bottom: 16rpx;
}
.album__row {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}
.album__row:last-child {
  border-bottom: none;
}
.album__cat {
  width: 160rpx;
  font-size: 28rpx;
  flex-shrink: 0;
}
.album__ops {
  display: flex;
  align-items: center;
  margin-left: auto;
}
.album__thumb {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  background: #eeeeee;
}
.album__empty {
  width: 120rpx;
  height: 120rpx;
  line-height: 120rpx;
  text-align: center;
  border: 2rpx dashed #dddddd;
  border-radius: 12rpx;
  box-sizing: border-box;
  font-size: 24rpx;
}
.album__op {
  font-size: 24rpx;
  margin-left: 20rpx;
}
```

- [ ] **Step 5: 接通菜单 + 回归 + 提交**

`mine.js` 的 `WIRED` 追加 `album: '/pages/album-edit/album-edit',`。

Run: `npm test` → Expected: PASS

```bash
git add miniprogram/pages/album-edit miniprogram/app.json miniprogram/pages/mine/mine.js
git commit -m "feat(page): 相册编辑页（5 分类照片上传）"
```

---

### Task 16: 故事编辑页 `pages/story-edit`（话题 + 语音录制）

**Files:**
- Create: `miniprogram/pages/story-edit/story-edit.{js,json,wxml,wxss}`
- Modify: `miniprogram/app.json`、`miniprogram/pages/mine/mine.js`（`menus` 追加 `story`，`WIRED` 接通）

**Interfaces:**
- Consumes: `auth.ensureLogin`、`request.callFunction('getMyProfile'/'updateProfile')`、`upload.uploadAudio`、`options.STORY_TOPICS`、`LIMITS.STORIES_MAX`
- Produces: 页面 data：`stories`（`[{topic, audioFileID}]`）、`topics`（STORY_TOPICS）、`recordingIndex`（-1 无录音中）、`playingIndex`。上传成功即整段保存（只提交完整行 `topic && audioFileID`）。录音用 `wx.getRecorderManager()`（mp3，≤60s），播放用 `wx.createInnerAudioContext()`。**录音/播放无法在 Jest 中验证**（真机/工具手动 + E2E 结构断言）。

- [ ] **Step 1: 注册页面 + json**

`app.json` 追加 `"pages/story-edit/story-edit",`；`story-edit.json`：

```json
{
  "navigationBarTitleText": "我的故事",
  "usingComponents": {}
}
```

- [ ] **Step 2: 新建 `story-edit.js`**

```js
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
```

- [ ] **Step 3: 新建 `story-edit.wxml`**

```xml
<view class="container story">
  <view class="text-secondary story__tip">录制最多 5 段语音故事，每段 ≤60 秒</view>

  <view class="card story__item" wx:for="{{stories}}" wx:key="index">
    <picker range="{{topics}}" value="{{item.topic}}" bindchange="onPickTopic" data-index="{{index}}">
      <view class="story__row">
        <text class="story__topic {{item.topic ? '' : 'text-secondary'}}">{{item.topic || '选择话题'}}</text>
        <text class="story__arrow text-secondary">›</text>
      </view>
    </picker>

    <view class="story__row">
      <text
        wx:if="{{recordingIndex !== index}}"
        class="story__rec text-primary"
        bindtap="onTapRecord"
        data-index="{{index}}"
      >{{item.audioFileID ? '重新录制' : '● 开始录音'}}</text>
      <text wx:else class="story__rec story__rec--on" bindtap="onTapStop">■ 结束录音</text>

      <text wx:if="{{item.audioFileID}}"
            class="story__play {{playingIndex === index ? 'story__play--on' : ''}}"
            bindtap="onTogglePlay" data-index="{{index}}">
        {{playingIndex === index ? '■ 停止' : '▶ 试听'}}
      </text>

      <text class="story__del text-secondary" bindtap="onDeleteStory" data-index="{{index}}">删除</text>
    </view>
  </view>

  <view wx:if="{{stories.length < 5}}" class="story__add" bindtap="onAddStory">＋ 添加故事</view>
</view>
```

（`wx:key="index"` 处：话题唯一性由页面逻辑保证，但行可能 topic 为空（多行空 topic 相同），故此处用 `"index"`。）

- [ ] **Step 4: 新建 `story-edit.wxss`**

```css
.story__tip {
  font-size: 24rpx;
  margin-bottom: 16rpx;
}
.story__item {
  margin-bottom: 20rpx;
}
.story__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
}
.story__topic {
  font-size: 28rpx;
}
.story__arrow {
  font-size: 30rpx;
}
.story__rec {
  font-size: 26rpx;
}
.story__rec--on {
  font-weight: 600;
}
.story__play {
  font-size: 26rpx;
  margin-left: 24rpx;
}
.story__del {
  font-size: 24rpx;
  margin-left: 24rpx;
}
.story__add {
  text-align: center;
  padding: 24rpx;
  color: var(--color-primary);
  background: #ffffff;
  border-radius: var(--radius-card);
}
```

- [ ] **Step 5: 接通菜单 + 回归 + 提交**

`mine.js`：`menus` 在 `album` 后追加 `{ id: 'story', label: '我的故事' }`；`WIRED` 追加 `story: '/pages/story-edit/story-edit',`。

Run: `npm test` → Expected: PASS

```bash
git add miniprogram/pages/story-edit miniprogram/app.json miniprogram/pages/mine/mine.js
git commit -m "feat(page): 故事编辑页（话题+语音录制上传）"
```

---

### Task 17: 标签编辑页 `pages/tags-edit`（4 类预设池多选）

**Files:**
- Create: `miniprogram/pages/tags-edit/tags-edit.{js,json,wxml,wxss}`
- Modify: `miniprogram/app.json`、`miniprogram/pages/mine/mine.js`（`menus` 追加 `tags`，`WIRED` 接通）

**Interfaces:**
- Consumes: `auth.ensureLogin`、`request.callFunction('getMyProfile'/'updateProfile')`、`options.TAG_POOLS`、`LIMITS.TAGS_PER_CATEGORY_MAX`
- Produces: 页面 data：`pools`（`[{key, title, items: [{name, selected}]}]`）。保存按钮统一提交 `updateProfile({patch:{tags}})`；每类最多 5 个，超出 toast 拒绝。

- [ ] **Step 1: 注册页面 + json**

`app.json` 追加 `"pages/tags-edit/tags-edit",`；`tags-edit.json`：

```json
{
  "navigationBarTitleText": "我的标签",
  "usingComponents": {}
}
```

- [ ] **Step 2: 新建 `tags-edit.js`**

```js
// pages/tags-edit/tags-edit.js —— 4 类标签预设池多选（每类 ≤5）
const { callFunction } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { TAG_POOLS, LIMITS } = require('../../utils/options.js');

const POOL_TITLES = {
  hobby: '爱好', personality: '性格', food: '喜欢的食物', media: '喜欢的影视',
};

Page({
  data: {
    pools: [],   // [{key, title, items: [{name, selected}]}]
    saving: false,
  },

  async onLoad() {
    await ensureLogin();
    const res = await callFunction('getMyProfile');
    const selected = (res && res.profile && res.profile.tags) || {};
    this.setData({ pools: this.buildPools(selected) });
  },

  buildPools(selected) {
    return Object.keys(TAG_POOLS).map((key) => ({
      key,
      title: POOL_TITLES[key],
      items: TAG_POOLS[key].map((name) => ({
        name,
        selected: ((selected[key] || []).indexOf(name) >= 0),
      })),
    }));
  },

  onToggle(e) {
    const { group, name } = e.currentTarget.dataset;
    const gi = this.data.pools.findIndex((p) => p.key === group);
    const pool = this.data.pools[gi];
    const item = pool.items.find((it) => it.name === name);
    if (!item.selected) {
      const count = pool.items.filter((it) => it.selected).length;
      if (count >= LIMITS.TAGS_PER_CATEGORY_MAX) {
        wx.showToast({ title: '每类最多选 ' + LIMITS.TAGS_PER_CATEGORY_MAX + ' 个', icon: 'none' });
        return;
      }
    }
    const ii = pool.items.indexOf(item);
    this.setData({ ['pools[' + gi + '].items[' + ii + '].selected']: !item.selected });
  },

  async onSave() {
    if (this.data.saving) return;
    const tags = {};
    this.data.pools.forEach((p) => {
      tags[p.key] = p.items.filter((it) => it.selected).map((it) => it.name);
    });
    this.setData({ saving: true });
    const res = await callFunction('updateProfile', { patch: { tags } });
    this.setData({ saving: false });
    if (res && res.profile) {
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack({ fail: () => {} }), 600);
    } else {
      wx.showToast({ title: (res && res.error) || '保存失败', icon: 'none' });
    }
  },
});
```

- [ ] **Step 3: 新建 `tags-edit.wxml`**

```xml
<view class="container tags">
  <view class="text-secondary tags__tip">从预设池中选择，每类最多 5 个</view>

  <view class="card tags__group" wx:for="{{pools}}" wx:for-item="g" wx:key="key">
    <view class="tags__title">{{g.title}}</view>
    <view class="tags__chips">
      <text
        wx:for="{{g.items}}"
        wx:key="name"
        class="tags__chip {{item.selected ? 'tags__chip--on' : ''}}"
        data-group="{{g.key}}"
        data-name="{{item.name}}"
        bindtap="onToggle"
      >{{item.name}}</text>
    </view>
  </view>

  <button class="tags__save" loading="{{saving}}" disabled="{{saving}}" bindtap="onSave">保存</button>
</view>
```

- [ ] **Step 4: 新建 `tags-edit.wxss`**

```css
.tags__tip {
  font-size: 24rpx;
  margin-bottom: 16rpx;
}
.tags__group {
  margin-bottom: 20rpx;
}
.tags__title {
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.tags__chips {
  display: flex;
  flex-wrap: wrap;
}
.tags__chip {
  font-size: 24rpx;
  padding: 8rpx 20rpx;
  border-radius: 26rpx;
  background: #f5f5f5;
  color: #666666;
  margin: 0 16rpx 16rpx 0;
}
.tags__chip--on {
  background: #fff1f1;
  color: var(--color-primary);
}
.tags__save {
  margin-top: 16rpx;
  background: var(--color-primary);
  color: #ffffff;
  border-radius: 44rpx;
}
```

- [ ] **Step 5: 接通菜单 + 回归 + 提交**

`mine.js`：`menus` 在 `story` 后追加 `{ id: 'tags', label: '我的标签' }`；`WIRED` 追加 `tags: '/pages/tags-edit/tags-edit',`。

Run: `npm test` → Expected: PASS

```bash
git add miniprogram/pages/tags-edit miniprogram/app.json miniprogram/pages/mine/mine.js
git commit -m "feat(page): 标签编辑页（4 类预设池多选）"
```

---

### Task 18: 资料卡预览页 `pages/profile-preview`（他人视角）

**Files:**
- Create: `miniprogram/pages/profile-preview/profile-preview.{js,json,wxml,wxss}`
- Modify: `miniprogram/app.json`、`miniprogram/pages/mine/mine.js`（`menus` 追加 `preview`，`WIRED` 接通）

**Interfaces:**
- Consumes: `profile-card` 组件（Task 11/12）、`auth.ensureLogin`、`request.callFunction('getMyProfile')`、`profile.createEmptyProfile`
- Produces: 预览页 = 他人视角详情页雏形：完整资料卡 + 底部隐私占位行「🔒 征求同意后可见」（P3 激活授权流）。data：`profile`、`verified`（`user.role === 'verified'`）。

- [ ] **Step 1: 注册页面 + json**

`app.json` 追加 `"pages/profile-preview/profile-preview",`；`profile-preview.json`：

```json
{
  "navigationBarTitleText": "我的资料卡",
  "usingComponents": {
    "profile-card": "/components/profile-card/index"
  }
}
```

- [ ] **Step 2: 新建 `profile-preview.js`**

```js
// pages/profile-preview/profile-preview.js —— 我的资料卡预览（他人视角）
const { callFunction } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { createEmptyProfile } = require('../../utils/profile.js');

Page({
  data: {
    profile: null,
    verified: false,
  },

  async onLoad() {
    const user = await ensureLogin();
    const res = await callFunction('getMyProfile');
    // 云调用失败时用空模板兜底（E2E 无后端也可渲染）
    this.setData({
      profile: (res && res.profile) || createEmptyProfile(user),
      verified: !!(user && user.role === 'verified'),
    });
  },
});
```

- [ ] **Step 3: 新建 `profile-preview.wxml`**

```xml
<view class="container preview" wx:if="{{profile}}">
  <profile-card profile="{{profile}}" verified="{{verified}}" />

  <!-- 他人视角：隐私字段不显示明文（P3 激活授权流） -->
  <view class="card preview__privacy">
    <text class="text-secondary">🔒 联系方式与资产信息：征求同意后可见</text>
  </view>

  <view class="preview__tip text-secondary">以上为他人查看你资料卡时的效果</view>
</view>
```

- [ ] **Step 4: 新建 `profile-preview.wxss`**

```css
.preview__privacy {
  margin-top: 24rpx;
  font-size: 26rpx;
}
.preview__tip {
  text-align: center;
  font-size: 24rpx;
  margin-top: 32rpx;
}
```

- [ ] **Step 5: 接通菜单 + 回归 + 提交**

`mine.js`：`menus` 在 `tags` 后追加 `{ id: 'preview', label: '预览我的资料卡' }`；`WIRED` 追加 `preview: '/pages/profile-preview/profile-preview',`。

Run: `npm test` → Expected: PASS

```bash
git add miniprogram/pages/profile-preview miniprogram/app.json miniprogram/pages/mine/mine.js
git commit -m "feat(page): 资料卡预览页（他人视角）"
```

---

### Task 19: 设置页 `pages/settings` + 静态协议页 `pages/agreement`

**Files:**
- Create: `miniprogram/pages/settings/settings.{js,json,wxml,wxss}`
- Create: `miniprogram/pages/agreement/agreement.{js,json,wxml,wxss}`
- Modify: `miniprogram/app.json`、`miniprogram/pages/mine/mine.js`（`settings` 接通，最终菜单 `[edit, album, story, tags, preview, settings]`）

**Interfaces:**
- Consumes: `auth.clearLogin/ensureLogin`、`request.callFunction('deleteAccount')`
- Produces: 设置页菜单：帮助/关于/用户协议/隐私政策（均跳 `agreement?type=…`）、退出登录（confirm → `clearLogin` → reLaunch 推荐 tab）、注销账号（confirm → `deleteAccount` → `clearLogin` → reLaunch）。`agreement` 页按 `type ∈ {help, about, user, privacy}` 渲染静态文案。

- [ ] **Step 1: 注册页面 + json**

`app.json` 追加 `"pages/settings/settings",` 与 `"pages/agreement/agreement",`。

`settings.json`：

```json
{
  "navigationBarTitleText": "设置",
  "usingComponents": {}
}
```

`agreement.json`：

```json
{
  "navigationBarTitleText": "协议",
  "usingComponents": {}
}
```

- [ ] **Step 2: 新建 `settings.js`**

```js
// pages/settings/settings.js —— 设置：帮助/关于/协议/隐私/退出登录/注销
const { callFunction } = require('../../utils/request.js');
const { clearLogin } = require('../../utils/auth.js');

Page({
  data: {
    menus: [
      { id: 'help', label: '帮助' },
      { id: 'about', label: '关于遇见爱' },
      { id: 'user', label: '用户协议' },
      { id: 'privacy', label: '隐私政策' },
      { id: 'logout', label: '退出登录' },
      { id: 'delete', label: '注销账号' },
    ],
  },

  onTapMenu(e) {
    const { id } = e.currentTarget.dataset;
    if (['help', 'about', 'user', 'privacy'].indexOf(id) >= 0) {
      wx.navigateTo({ url: '/pages/agreement/agreement?type=' + id });
      return;
    }
    if (id === 'logout') {
      wx.showModal({
        title: '退出登录',
        content: '确定退出当前账号吗？',
        success: (r) => {
          if (!r.confirm) return;
          clearLogin();
          wx.showToast({ title: '已退出', icon: 'success' });
          wx.reLaunch({ url: '/pages/recommend/recommend' });
        },
      });
      return;
    }
    if (id === 'delete') {
      wx.showModal({
        title: '注销账号',
        content: '注销将删除你的全部资料（含相册与语音故事），不可恢复。确定继续吗？',
        confirmText: '仍要注销',
        confirmColor: '#FF5A5F',
        success: async (r) => {
          if (!r.confirm) return;
          const res = await callFunction('deleteAccount');
          clearLogin();
          if (res && res.deleted) {
            wx.showToast({ title: '已注销', icon: 'success' });
          } else {
            // 云端删除失败也先退出登录；下次登录会重建账号
            wx.showToast({ title: '已退出（注销未完成，可重试）', icon: 'none' });
          }
          wx.reLaunch({ url: '/pages/recommend/recommend' });
        },
      });
    }
  },
});
```

- [ ] **Step 3: 新建 `settings.wxml`**

```xml
<view class="container settings">
  <view class="card settings__menus">
    <view
      wx:for="{{menus}}"
      wx:key="id"
      class="settings__menu {{item.id === 'delete' ? 'settings__menu--danger' : ''}}"
      data-id="{{item.id}}"
      bindtap="onTapMenu"
    >
      <text>{{item.label}}</text>
      <text class="settings__arrow text-secondary">›</text>
    </view>
  </view>
  <view class="text-secondary settings__ver">遇见爱 v1.0.1</view>
</view>
```

- [ ] **Step 4: 新建 `settings.wxss`**

```css
.settings__menus {
  padding: 0;
}
.settings__menu {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 28rpx 24rpx;
  border-bottom: 1rpx solid #f0f0f0;
}
.settings__menu:last-child {
  border-bottom: none;
}
.settings__menu--danger text:first-child {
  color: var(--color-primary);
}
.settings__arrow {
  font-size: 32rpx;
}
.settings__ver {
  text-align: center;
  font-size: 24rpx;
  margin-top: 32rpx;
}
```

- [ ] **Step 5: 新建 `agreement.js`**

```js
// pages/agreement/agreement.js —— 静态文案页（?type=help|about|user|privacy）
// 注意：用户协议/隐私政策为婚恋类目审核必需项，以下为可上线的基础模板，
// 正式发布前请运营方/法务复核替换（Task 21 文档再次提醒）。
const DOCS = {
  user: {
    title: '用户协议',
    paragraphs: [
      '欢迎使用遇见爱。本协议是你与运营方之间就使用本小程序所订立的契约。',
      '一、账号：你通过微信授权登录并完善相亲资料。昵称、性别、生日在注册确认后不可修改。',
      '二、行为规范：你必须年满 18 周岁且为单身状态；禁止发布虚假资料、广告、涉黄涉赌等违法违规信息；禁止骚扰其他用户。违反者运营方有权下架资料或封禁账号。',
      '三、服务内容：本小程序提供资料展示与匹配服务，不承诺交友结果；线上聊天请移步微信，注意人身与财产安全。',
      '四、账号注销：你可在「设置-注销账号」中删除全部资料，删除后不可恢复。',
      '五、本协议的订立、执行与解释适用中华人民共和国法律。',
    ],
  },
  privacy: {
    title: '隐私政策',
    paragraphs: [
      '遇见爱非常重视你的个人信息保护，本政策说明我们如何收集、使用与保护你的信息。',
      '一、我们收集的信息：微信 openid（登录标识）、你主动填写的相亲资料（含头像、照片、语音故事）、可选绑定的手机号。',
      '二、信息使用：仅用于资料展示、匹配与账号找回，不用于任何第三方营销，不出售给任何第三方。',
      '三、隐私字段保护：你的联系方式与资产信息默认对其他用户隐藏，仅在对方申请且你同意后可见，你随时可撤销授权。',
      '四、存储与删除：数据存储于微信云开发服务；注销账号时删除全部资料。语音与照片存储于云存储，注销后文件不再被任何入口引用。',
      '五、你可以通过「设置-退出登录」清除本地登录态；通过「设置-注销账号」删除全部数据。',
    ],
  },
  help: {
    title: '帮助',
    paragraphs: [
      'Q：如何完善资料？——在「我的-编辑资料」填写基本资料与相亲信息，相册、语音故事与标签在各自入口维护。',
      'Q：为什么昵称、性别、生日不能改？——相亲资料强调真实可信，注册确认后锁定；如有特殊情况请联系客服。',
      'Q：我的手机号会被别人看到吗？——不会。联系方式默认隐藏，仅在匹配后经你授权才可见。',
      'Q：如何注销？——「设置-注销账号」，删除后不可恢复。',
      'Q：遇到骚扰怎么办？——后续版本将开放举报入口；当前可联系客服处理。',
    ],
  },
  about: {
    title: '关于遇见爱',
    paragraphs: [
      '遇见爱（just4love）是一个高质量、提升相亲效率、保护隐私安全的相亲交友小程序。',
      '版本：1.0.1',
      '我们相信：认真填写资料的人，值得被认真对待。',
    ],
  },
};

Page({
  data: {
    doc: null,
  },

  onLoad(query) {
    const doc = DOCS[(query && query.type) || 'user'] || DOCS.user;
    this.setData({ doc });
    wx.setNavigationBarTitle({ title: doc.title });
  },
});
```

- [ ] **Step 6: 新建 `agreement.wxml` 与 `agreement.wxss`**

```xml
<view class="container agreement" wx:if="{{doc}}">
  <view class="card">
    <view class="agreement__title">{{doc.title}}</view>
    <view class="agreement__p" wx:for="{{doc.paragraphs}}" wx:key="index">{{item}}</view>
  </view>
</view>
```

```css
.agreement__title {
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 20rpx;
}
.agreement__p {
  font-size: 26rpx;
  line-height: 1.8;
  color: #555555;
  margin-bottom: 20rpx;
}
```

- [ ] **Step 7: 接通菜单 + 回归 + 提交**

`mine.js`：`WIRED` 追加 `settings: '/pages/settings/settings',`。此时 `menus` 最终为：

```js
    menus: [
      { id: 'edit', label: '编辑资料' },
      { id: 'album', label: '我的相册' },
      { id: 'story', label: '我的故事' },
      { id: 'tags', label: '我的标签' },
      { id: 'preview', label: '预览我的资料卡' },
      { id: 'settings', label: '设置' },
    ],
```

Run: `npm test` → Expected: PASS

```bash
git add miniprogram/pages/settings miniprogram/pages/agreement miniprogram/app.json miniprogram/pages/mine/mine.js
git commit -m "feat(page): 设置页与协议静态页（含注销/退出）"
```

---

### Task 20: E2E 测试（P1 关键路径）

**Files:**
- Create: `tests/e2e/p1-profile.test.ts`

**Interfaces:**
- Consumes: `tests/e2e/helpers.ts`（`connectOrLaunch/closeSession/currentRoute/pageData/countSelector/runInApp/TEST_TIMEOUT`）、e2e-test skill 规则（App 级通道、每 `it` 显式传 `T`）
- 说明：E2E 在无部署云环境运行（云调用失败 → 页面兜底渲染），因此断言页面结构/data，不断言云端数据；云函数行为由集成测试覆盖。

**先调用 `.claude/skills/e2e-test` skill（项目约定），再按以下内容实现。**

- [ ] **Step 1: 写 E2E 测试文件**

```ts
/**
 * P1 登录与资料 E2E —— 关键路径（App 级通道，遵守 e2e-test skill 规则）
 * 云环境未部署时云调用失败，页面应兜底渲染（不断言云端数据）。
 */
import {
  connectOrLaunch,
  closeSession,
  currentRoute,
  pageData,
  countSelector,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
} from './helpers';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('P1 登录与资料 E2E', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await connectOrLaunch();
    mp = session.miniProgram;
  }, 120000);

  afterAll(() => closeSession(session));

  it('我的页渲染完整菜单（最终六项）', async () => {
    await mp.switchTab('/pages/mine/mine');
    expect(await currentRoute(mp)).toContain('mine');
    const menus = await pageData<{ id: string; label: string }[]>(mp, 'menus');
    expect(menus.map((m) => m.id)).toEqual([
      'edit', 'album', 'story', 'tags', 'preview', 'settings',
    ]);
  }, T);

  it('可进入资料编辑页且选项池正确加载', async () => {
    await mp.navigateTo('/pages/profile-edit/profile-edit');
    expect(await currentRoute(mp)).toContain('profile-edit');
    await wait(1500); // 等 onLoad 的云调用失败回落
    const d = await pageData<{
      loveGoals: string[];
      familyBackground: string[];
      heightRange: number[];
      draft: { basic: object };
    }>(mp);
    expect(d.loveGoals).toHaveLength(4);
    expect(d.familyBackground).toHaveLength(12);
    expect(d.heightRange[0]).toBe(140);
    expect(d.draft).toBeTruthy(); // 云端无资料时兜底为空模板
    expect(d.draft.basic).toBeTruthy();
    await mp.navigateBack();
  }, T);

  it('相册/标签页结构正确', async () => {
    await mp.navigateTo('/pages/album-edit/album-edit');
    await wait(1200);
    const slots = await pageData<{ category: string; fileID: string }[]>(mp, 'slots');
    expect(slots.map((s) => s.category)).toEqual([
      '日常生活', '兴趣爱好', '旅行经历', '家有萌宠', '健身运动',
    ]);
    await mp.navigateBack();

    await mp.navigateTo('/pages/tags-edit/tags-edit');
    await wait(1200);
    const pools = await pageData<{ key: string; items: { name: string; selected: boolean }[] }[]>(mp, 'pools');
    expect(pools.map((p) => p.key)).toEqual(['hobby', 'personality', 'food', 'media']);
    expect(pools[0].items.length).toBeGreaterThanOrEqual(6);
    await mp.navigateBack();
  }, T);

  it('预览页挂载完整资料卡组件（他人视角，隐私不显示明文）', async () => {
    await mp.navigateTo('/pages/profile-preview/profile-preview');
    await wait(1500);
    expect(await currentRoute(mp)).toContain('profile-preview');
    expect(await countSelector(mp, 'profile-card')).toBe(1);
    const profile = await pageData<{ privacy?: unknown }>(mp, 'profile');
    expect(profile).toBeTruthy();
    await mp.navigateBack();
  }, T);

  it('设置页菜单与协议页内容', async () => {
    await mp.navigateTo('/pages/settings/settings');
    expect(await currentRoute(mp)).toContain('settings');
    const menus = await pageData<{ id: string }[]>(mp, 'menus');
    expect(menus.map((m) => m.id)).toEqual([
      'help', 'about', 'user', 'privacy', 'logout', 'delete',
    ]);
    await mp.navigateBack();

    await mp.navigateTo('/pages/agreement/agreement?type=privacy');
    await wait(800);
    const doc = await pageData<{ title: string; paragraphs: string[] }>(mp, 'doc');
    expect(doc.title).toBe('隐私政策');
    expect(doc.paragraphs.length).toBeGreaterThanOrEqual(4);
    await mp.navigateBack();
  }, T);

  it('推荐 tab 的 profile-card mock 列表仍渲染', async () => {
    await mp.switchTab('/pages/recommend/recommend');
    expect(await countSelector(mp, 'profile-card')).toBe(2);
  }, T);
});
```

- [ ] **Step 2: 类型检查 + 运行**

```bash
npx tsc --noEmit -p tsconfig.json
npm run test:e2e
```

Expected: 类型检查 0 错误；6 个用例 PASS

- [ ] **Step 3: 全量回归 + 提交**

```bash
npm test
git add tests/e2e/p1-profile.test.ts
git commit -m "test(e2e): P1 登录与资料关键路径"
```

---

### Task 21: 部署文档 + 全量验收

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: 全部前序任务
- Produces: README 增加「P1 部署与验收」章节（见 Step 1 内容）；P1 验收口径对齐规格 §10。

- [ ] **Step 1: README 追加章节**

在 README 适当位置（测试说明之后）追加：

````markdown
## P1 部署与验收（登录与个人资料）

### 首次部署步骤

1. **云环境**：微信开发者工具 → 云开发 → 创建环境，将 `miniprogram/app.js` 中
   `env: 'just4love-env'` 替换为真实环境 ID。
2. **云数据库**：云开发控制台 → 数据库，创建集合 `users`、`profiles`、`counters`，
   权限设为「仅创建者可读写」（客户端不直连数据库，读写全部经云函数）。
3. **云函数**：对 `cloudfunctions/` 下 `login`、`getMyProfile`、`updateProfile`、
   `bindPhone`、`deleteAccount` 逐个右键「上传并部署：云端安装依赖」。
4. **手机号绑定**（可选能力）：需企业主体小程序；个人主体下「微信获取」按钮静默失败，
   不影响手动填写手机号。
5. **指定管理员**（P4 前约定）：云开发控制台 → 数据库 → `users`，将目标用户文档的
   `role` 手动改为 `admin`。
6. **协议文案**：`pages/agreement/agreement.js` 中的用户协议/隐私政策为模板文案，
   正式发布前请法务/运营复核替换。

### 验收清单（对应设计文档 §10）

- [ ] 新用户首次打开自动注册（`users` 新建文档、嘉宾编号 J0001 递增）
- [ ] 完整编辑资料：基本资料（头像/昵称/性别/生日→星座/签名）、相亲信息 14 项、
      隐私字段（资产/联系方式）、相册 5 分类、故事 5 段语音、标签 4 类
- [ ] 昵称/性别/生日注册确认后锁定（前端禁用 + 云端 `basic locked` 双保险）
- [ ] 「预览我的资料卡」以他人视角展示完整资料卡（语音可播、照片可翻页、
      隐私字段只显示 🔒 占位）
- [ ] 设置页：帮助/关于/用户协议/隐私政策/退出登录/注销（注销后 users+profiles 文档删除）
- [ ] `npm test`（unit+integration）与 `npm run test:e2e` 全部通过
````

- [ ] **Step 2: 全量验收**

```bash
npm test            # unit + integration
npm run test:e2e    # 需本机微信开发者工具
```

Expected: 全部 PASS

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs: P1 部署说明与验收清单"
```

---

## 已知限制与风险（P1 接受，不做）

- `nextGuestNo` 的 update(inc) 原子但随后 get 非原子，极端并发可能重号——P1 用户量级可接受，P2 观察后可改为事务。
- 注销不级联删除云存储文件（头像/相册/语音）——fileID 失去引用入口，无泄露途径。
- 真人头像无技术校验——依赖 P4 人工认证/上墙审核（规格 §4.3 明确）。
- `getPhoneNumber` 需企业主体，个人主体下按钮静默失败，手动填写不受影响。
- E2E 不覆盖真实云端链路（云函数行为由集成测试覆盖），真机全链路需按 README 手动验收。

## 验收对照（规格 §10 P1 口径 → 任务）

| 验收标准 | 覆盖任务 |
|---|---|
| 新用户可登录 | Task 3/8/9（login 云函数+auth+我的页） |
| 完整编辑资料（相册/故事/标签/隐私字段） | Task 14/15/16/17 |
| 预览自己的完整资料卡 | Task 11/12/18 |
| 单测+集成+E2E 通过 | Task 20/21（各任务内建 TDD） |
| 用户协议+隐私政策上线（§9.4） | Task 19 |
| 注销能力（§9.4） | Task 7/19 |






