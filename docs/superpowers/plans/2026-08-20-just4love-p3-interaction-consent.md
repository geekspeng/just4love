# just4love P3「互动与隐私授权」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 心动互配（导流微信聊天）+ 谁看过我/喜欢我的 + 消息 tab 真通知流 + 隐私字段授权流（申请→同意→解锁→撤销）+ 举报，并落地 P2 终审遗留（配额原子化/basicInit 防御/错误区分等）。

**Architecture:** 7 个新云函数 + 3 个既有云函数改造，沿用 P1/P2 的「注入 mock-db 集成测试」模式；前端激活 profile-detail 按钮组与隐私区、message 页从 mock 会话改为通知流，新增 interaction-list / report 两个页面；互配与授权状态落在 `interactions`/`consents`/`notifications` 三集合，展示快照冗余进通知 payload 免跨集合 join。

**Tech Stack:** 微信云开发（wx-server-sdk ~2.6.3）、Jest 三层（unit=simulate / integration=mock-db / e2e=miniprogram-automator App 级通道）、TDesign（延续现行风格基线：t-cell/t-empty/t-button/t-picker/t-avatar/t-badge）。

**Spec:** `docs/superpowers/specs/2026-08-15-just4love-phased-roadmap-design.md` §6（P3）+ §6.7（P2 遗留，T12 勾稽）。

## Global Constraints

- 测试命令：`npm test`（unit+integration）；`npm run test:e2e`；E2E 前先 `npx tsc --noEmit -p tsconfig.json`。
- 敏感值约定（CLAUDE.md）：不要 `git add -f`；不触碰 `miniprogram/app.js` 与 `project.config.json`。
- 云函数模块**顶层不得** `require('wx-server-sdk')`；每函数目录自带 `package.json`（`wx-server-sdk: ~2.6.3`，name/description 按函数改）。
- 云函数间不共享代码（部署根隔离）：`toCardVO`/`notify`/`profileSnapshot` 等小函数多处镜像，注释标「保持同步」——用户已裁定的既定约定，审查勿按重复代码 flag。
- E2E 遵守 `.claude/skills/e2e-test`：只走 App 级通道；每个 `it` 显式传 `TEST_TIMEOUT as T`；跨组件边界选择器 `>>>`；**TDesign check-tag 实渲染节点类名是 `.t-tag`**（2026-08-19 探针实测）。
- 云函数部署走 IDE GUI（CLI deploy 41002）；T12 有部署清单。
- TDesign 风格基线：非 open-type 按钮一律 `t-button`；行布局 `t-cell`；空态 `t-empty`；弹层选择用共享 `t-picker`（visible 状态模式，参照 profile-edit/filter-panel）；`<textarea>` 与 `open-type` 按钮保留原生。
- 新集合数据库权限「仅创建者可读写」。
- 游客语义不变：users 查无 openid 文档 → `{ error: 'login required' }`。

## 数据契约（各任务共用）

**interactions**（T2 写，T3/T6 读）——每对 (fromOpenid, targetOpenid) 一文档，存「当前态度」（切换覆盖）：

```js
{ fromOpenid, fromUserId, targetId, targetOpenid, type: 'like' | 'pass', createdAt, updatedAt }
```

**consents**（T4 写，T5 读）——每对 (requesterOpenid, ownerOpenid, field) 一文档，状态机流转（重新申请复用同文档）：

```js
{ requesterOpenid, ownerOpenid, field: 'contact' | 'asset',
  status: 'pending' | 'approved' | 'rejected' | 'revoked',
  createdAt, updatedAt, decidedAt }
```

**notifications**（T1/T2/T4 写，T7 读）——payload 为落库时的展示快照（nickname/guestNo 冗余，免 join）：

```js
{ toOpenid, type: 'view' | 'like' | 'match' | 'consent_request' | 'consent_result',
  payload: { nickname, guestNo, profileId, ... },  // consent_* 另带 field/consentId/status
  read: false, createdAt }
```

**quota_counters**（T1 写）——配额原子计数：`{ _id: '<openid>_<dateKey>', count }`，`inc` 原子增减。

**reports**（T8 写）——`{ reporterOpenid, targetId, targetOpenid, type, description, screenshotFileIDs: [], status: 'pending', createdAt }`。

**getProfileDetail 成功响应（T5 起扩展）**：`{ profile: CardVO, verified, self, quota, consents: { contact: status, asset: status } }`，status ∈ `none/pending/approved/rejected/revoked`；self/admin 恒 `approved`。解锁语义：`consents[field]==='approved'` 时 profile.privacy 附该子段（`privacy.contact` 或 `privacy.asset`），未解锁不附键。

**REPORT_TYPES**（T8 + 前端 options.js 同步字面量）：`['虚假资料', '诈骗行为', '骚扰', '色情低俗', '其他']`。

---

### Task 1: getProfileDetail 强化（basicInit 防御 + 配额原子化 + 被查看通知）+ setupDb 扩集合

**Files:**
- Modify: `cloudfunctions/getProfileDetail/index.js`
- Modify: `cloudfunctions/setupDb/index.js`（COLLECTIONS 追加 5 个集合）
- Modify: `tests/integration/getProfileDetail.test.js`（追加 4 用例）
- Test: `tests/integration/setupDb.test.js`（无改动，回归即可）

**Interfaces:**
- Consumes: P2 的 getProfileDetail 结构（现文件即基准）、`notify` 通知文档形状（本任务定义，T2/T4 镜像同步）
- Produces: `acquireQuota(db, openid, dateKey, limit)` → `{ ok, used }`（原子计数，超限自动回退）；getProfileDetail 对未完善资料返回 `not found`；首次查看写 `notifications`（type `view`）；集合 `interactions/consents/notifications/reports/quota_counters` 入 setupDb 清单（后续任务部署地基）

- [ ] **Step 1: 写失败测试**

`tests/integration/getProfileDetail.test.js` 的 seed() 中 `profiles` 工厂生成的文档均带 `basicInit: true`（现状如此）。在 describe 末尾追加：

```js
  test('未完善资料（basicInit=false）→ not found（P2 终审遗留防御）', async () => {
    const db = seed({ normal: 5, verified: 15 });
    // 造一份未完善资料
    await db.collection('profiles').add({
      data: { _id: 'p-raw', openid: 'o-raw', basicInit: false, basic: {}, about: {}, createdAt: '2026-08-20T00:00:00Z' },
    });
    const res = await getProfileDetailByOpenid('o-normal', 'p-raw', db);
    expect(res).toEqual({ error: 'not found' });
  });

  test('超额后 quota_counters 回退到 limit（原子计数不留脏值）', async () => {
    const db = seed({ normal: 2, verified: 3 });
    await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    await getProfileDetailByOpenid('o-normal', 'p-o-t4', db);
    const third = await getProfileDetailByOpenid('o-normal', 'p-o-t5', db);
    expect(third.error).toBe('quota exceeded');
    const counter = await db.collection('quota_counters').doc('o-normal_' + toDateKey(new Date())).get();
    expect(counter.data.count).toBe(2); // 回退后 == limit
  });

  test('首次查看写「被查看」通知（快照含 guestNo），复看不重复写', async () => {
    const db = seed({ normal: 5, verified: 15 });
    await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    const notes = await db.collection('notifications').where({ toOpenid: 'o-t3' }).get();
    expect(notes.data).toHaveLength(1);
    expect(notes.data[0].type).toBe('view');
    expect(notes.data[0].payload.guestNo).toBe('J0002'); // o-normal 的 guestNo
    expect(notes.data[0].read).toBe(false);
    await getProfileDetailByOpenid('o-normal', 'p-o-t3', db); // 复看
    const again = await db.collection('notifications').where({ toOpenid: 'o-t3' }).get();
    expect(again.data).toHaveLength(1);
  });

  test('self/admin 查看不写「被查看」通知', async () => {
    const db = seed({ normal: 5, verified: 15 });
    await getProfileDetailByOpenid('o-admin', 'p-o-t3', db);
    await getProfileDetailByOpenid('o-owner', 'p-o-owner', db);
    const notes = await db.collection('notifications').where({}).get();
    expect(notes.data).toHaveLength(0);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/getProfileDetail.test.js`
Expected: FAIL——p-raw 用例返回了 profile 而非 not found；quota_counters 集合不存在（doc get 抛错）；notifications 集合为空。

- [ ] **Step 3: 实现 getProfileDetail 改造**

`cloudfunctions/getProfileDetail/index.js` 三处改动。

(1) 文件头部注释块之后、`toCardVO` 之前，追加两个函数：

```js
// 通知落库（部署根隔离：interact/requestConsent/respondConsent 各持一份同构实现，字段形状保持同步）
async function notify(db, toOpenid, type, payload) {
  await db.collection('notifications').add({
    data: { toOpenid, type, payload, read: false, createdAt: new Date().toISOString() },
  });
}

// 配额原子计数：inc 原子增后读回校验，超限即回退（并发下唯一计数入口，P2 终审遗留的原子化方案）
// 已看目标的复用路径不进入本函数（view_logs 去重口径不变）。
async function acquireQuota(db, openid, dateKey, limit) {
  const counters = db.collection('quota_counters');
  const id = openid + '_' + dateKey;
  try {
    await counters.doc(id).get();
  } catch (e) {
    await counters.doc(id).set({ data: { count: 0 } });
  }
  await counters.doc(id).update({ data: { count: db.command.inc(1) } });
  const after = (await counters.doc(id).get()).data.count;
  if (after > limit) {
    await counters.doc(id).update({ data: { count: db.command.inc(-1) } });
    return { ok: false, used: limit };
  }
  return { ok: true, used: after };
}
```

(2) `getProfileDetailByOpenid` 中，`catch (e) { return { error: 'not found' }; }` 之后、`// 目标用户角色` 注释之前插入：

```js
  // 未完善资料不上列表也不可被直链/分享查看（P2 终审遗留防御）
  if (!target.basicInit) return { error: 'not found' };
```

(3) 将 `if (seen.size >= limit) { ... }` 起至函数末尾的「超额检查 + 写日志 + 返回」整段（现 L97-L107）替换为：

```js
  const acquired = await acquireQuota(db, openid, dateKey, limit);
  if (!acquired.ok) {
    return { error: 'quota exceeded', quota: { used: limit, limit } };
  }
  await db.collection('view_logs').add({
    data: {
      viewerOpenid: openid, viewerId: me._id,
      targetId: profileId, targetOpenid: target.openid,
      dateKey, createdAt: new Date().toISOString(),
    },
  });
  // 「被查看」通知（首次查看当天才走到这里；快照冗余 nickname/guestNo 免 join）
  const myProfileArr = await db.collection('profiles').where({ openid }).get();
  const myBasic = (myProfileArr.data[0] && myProfileArr.data[0].basic) || {};
  await notify(db, target.openid, 'view', {
    nickname: myBasic.nickname || '',
    guestNo: myBasic.guestNo || me.guestNo || '',
    profileId: myProfileArr.data[0] ? myProfileArr.data[0]._id : null,
  });
  return { profile: toCardVO(target, targetRole), verified: isVerified, self: false, quota: { used: acquired.used, limit } };
```

- [ ] **Step 4: setupDb 扩集合**

`cloudfunctions/setupDb/index.js` 中：

```js
const COLLECTIONS = ['users', 'counters', 'profiles', 'config', 'view_logs'];
```

改为：

```js
const COLLECTIONS = [
  'users', 'counters', 'profiles', 'config', 'view_logs',
  'interactions', 'consents', 'notifications', 'reports', 'quota_counters',
];
```

- [ ] **Step 5: 跑测试确认通过 + 全量回归**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/getProfileDetail.test.js tests/integration/setupDb.test.js && npm test`
Expected: 全绿（既有配额用例数值不变：非并发下计数器与去重口径数值一致）。

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/getProfileDetail/index.js cloudfunctions/setupDb/index.js tests/integration/getProfileDetail.test.js
git commit -m "feat(cloud): getProfileDetail 配额原子化+basicInit 防御+被查看通知；setupDb 扩 5 集合（P2 终审遗留落地）"
```

---

### Task 2: interact 云函数（心动/无感 + 互配检测 + 通知）

**Files:**
- Create: `cloudfunctions/interact/index.js`、`cloudfunctions/interact/package.json`
- Test: `tests/integration/interact.test.js`（新建）

**Interfaces:**
- Consumes: T1 的 `notify(db, toOpenid, type, payload)` 形状（镜像复制，注释保持同步）；interactions/notifications 文档形状
- Produces: `interactByOpenid(openid, targetProfileId, type, db)` → `{ matched }`（like 且对方也 like 时 true，否则 false）或 `{ error: 'invalid type' | 'login required' | 'not found' | 'cannot interact self' }`；`exports.main(event)` 读 `event.targetProfileId/event.type`。T9 详情页按钮依赖返回形状。

- [ ] **Step 1: 写失败测试**

新建 `tests/integration/interact.test.js`：

```js
// tests/integration/interact.test.js —— interact 云函数（心动/无感/互配/通知）
const { createMockDb } = require('../helpers/mock-db.js');
const { interactByOpenid } = require('../../cloudfunctions/interact/index.js');

function seed() {
  return createMockDb({
    users: {
      uA: { _id: 'uA', openid: 'o-a', role: 'normal', guestNo: 'J0001' },
      uB: { _id: 'uB', openid: 'o-b', role: 'normal', guestNo: 'J0002' },
    },
    profiles: {
      pA: { _id: 'pA', openid: 'o-a', basicInit: true, basic: { guestNo: 'J0001', nickname: '小甲' }, about: {}, createdAt: '2026-08-01T00:00:00Z' },
      pB: { _id: 'pB', openid: 'o-b', basicInit: true, basic: { guestNo: 'J0002', nickname: '小乙' }, about: {}, createdAt: '2026-08-02T00:00:00Z' },
    },
  });
}

describe('cloudfunctions/interact', () => {
  test('游客 → login required；非法 type / 不存在目标 / 自己 / 未完善资料', async () => {
    const db = seed();
    expect(await interactByOpenid('o-stranger', 'pB', 'like', db)).toEqual({ error: 'login required' });
    expect(await interactByOpenid('o-a', 'pB', 'smile', db)).toEqual({ error: 'invalid type' });
    expect(await interactByOpenid('o-a', 'p-nope', 'like', db)).toEqual({ error: 'not found' });
    expect(await interactByOpenid('o-a', 'pA', 'like', db)).toEqual({ error: 'cannot interact self' });
    await db.collection('profiles').add({ data: { _id: 'pRaw', openid: 'o-raw', basicInit: false, basic: {}, createdAt: '2026-08-03T00:00:00Z' } });
    expect(await interactByOpenid('o-a', 'pRaw', 'like', db)).toEqual({ error: 'not found' });
  });

  test('单向心动：落 interactions + 对方收 like 通知（快照 nickname/guestNo/profileId）', async () => {
    const db = seed();
    const res = await interactByOpenid('o-a', 'pB', 'like', db);
    expect(res).toEqual({ matched: false });
    const inter = await db.collection('interactions').where({ fromOpenid: 'o-a', targetOpenid: 'o-b' }).get();
    expect(inter.data).toHaveLength(1);
    expect(inter.data[0].type).toBe('like');
    const notes = await db.collection('notifications').where({ toOpenid: 'o-b' }).get();
    expect(notes.data).toHaveLength(1);
    expect(notes.data[0].type).toBe('like');
    expect(notes.data[0].payload).toEqual({ nickname: '小甲', guestNo: 'J0001', profileId: 'pA' });
  });

  test('互配：后达成的一方触发双方 match 通知；重复 like 不重复通知', async () => {
    const db = seed();
    await interactByOpenid('o-a', 'pB', 'like', db);       // A 心动 B（B 收 like）
    const res = await interactByOpenid('o-b', 'pA', 'like', db); // B 心动 A → 匹配
    expect(res).toEqual({ matched: true });
    const toA = await db.collection('notifications').where({ toOpenid: 'o-a' }).get();
    const toB = await db.collection('notifications').where({ toOpenid: 'o-b' }).get();
    expect(toA.data).toHaveLength(1);
    expect(toA.data[0].type).toBe('match');
    expect(toA.data[0].payload.nickname).toBe('小乙');
    expect(toB.data.filter((n) => n.type === 'match')).toHaveLength(1);
    // 重复 like（同态度 upsert）→ 无新通知
    await interactByOpenid('o-a', 'pB', 'like', db);
    const toBAgain = await db.collection('notifications').where({ toOpenid: 'o-b' }).get();
    expect(toBAgain.data).toHaveLength(2); // like + match，未新增
  });

  test('态度切换：like→pass 覆盖同文档；pass→like 且对方仍 like → 重新匹配但通知只发 like 补发', async () => {
    const db = seed();
    await interactByOpenid('o-a', 'pB', 'like', db);
    await interactByOpenid('o-b', 'pA', 'like', db); // 匹配
    const toPass = await interactByOpenid('o-a', 'pB', 'pass', db);
    expect(toPass).toEqual({ matched: false });
    const inter = await db.collection('interactions').where({ fromOpenid: 'o-a', targetOpenid: 'o-b' }).get();
    expect(inter.data).toHaveLength(1); // upsert 不新建
    expect(inter.data[0].type).toBe('pass');
  });

  test('pass 不发通知；无感排除的 targetId 形状正确', async () => {
    const db = seed();
    await interactByOpenid('o-a', 'pB', 'pass', db);
    const inter = await db.collection('interactions').where({ fromOpenid: 'o-a' }).get();
    expect(inter.data[0].targetId).toBe('pB');
    const notes = await db.collection('notifications').where({}).get();
    expect(notes.data).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/interact.test.js`
Expected: FAIL——`Cannot find module '../../cloudfunctions/interact/index.js'`

- [ ] **Step 3: 实现**

新建 `cloudfunctions/interact/index.js`：

```js
// interact 云函数 —— 心动/无感：interactions 当前态度 upsert + 互配检测 + 通知
// 入参 { targetProfileId, type: 'like' | 'pass' }；返回 { matched } 或 { error }。
// 通知规则：态度变为 like 时——对方也 like → 双方各一条 match；否则对方一条 like。
// 重复同态度 like / 一切 pass 均不发通知。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

async function notify(db, toOpenid, type, payload) {
  await db.collection('notifications').add({
    data: { toOpenid, type, payload, read: false, createdAt: new Date().toISOString() },
  });
}

// 展示快照（与 getProfileDetail 的 notify 实现保持同步）
async function profileSnapshot(db, openid, fallbackGuestNo) {
  const arr = await db.collection('profiles').where({ openid }).get();
  const pf = arr.data[0];
  const b = (pf && pf.basic) || {};
  return {
    nickname: b.nickname || '',
    guestNo: b.guestNo || fallbackGuestNo || '',
    profileId: pf ? pf._id : null,
  };
}

async function interactByOpenid(openid, targetProfileId, type, db) {
  if (type !== 'like' && type !== 'pass') return { error: 'invalid type' };
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const me = meArr.data[0];

  let target;
  try {
    target = (await db.collection('profiles').doc(targetProfileId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }
  if (!target.basicInit) return { error: 'not found' };
  if (target.openid === openid) return { error: 'cannot interact self' };

  const now = new Date().toISOString();
  const inter = db.collection('interactions');
  const existingArr = await inter.where({ fromOpenid: openid, targetOpenid: target.openid }).get();
  const existing = existingArr.data[0];
  const wasLike = !!existing && existing.type === 'like';
  if (existing) {
    await inter.doc(existing._id).update({ data: { type, updatedAt: now } });
  } else {
    await inter.add({
      data: {
        fromOpenid: openid, fromUserId: me._id,
        targetId: targetProfileId, targetOpenid: target.openid,
        type, createdAt: now, updatedAt: now,
      },
    });
  }

  if (type === 'pass') return { matched: false };

  // 互配检测：对方对我也 like
  const revArr = await inter.where({ fromOpenid: target.openid, targetOpenid: openid, type: 'like' }).get();
  const matched = revArr.data.length > 0;

  if (!wasLike) { // 态度变化才通知（重复 like 静默）
    const mySnap = await profileSnapshot(db, openid, me.guestNo);
    if (matched) {
      const otherSnap = {
        nickname: (target.basic || {}).nickname || '',
        guestNo: (target.basic || {}).guestNo || '',
        profileId: targetProfileId,
      };
      await notify(db, openid, 'match', otherSnap);
      await notify(db, target.openid, 'match', mySnap);
    } else {
      await notify(db, target.openid, 'like', mySnap);
    }
  }
  return { matched };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    const e = event || {};
    return await interactByOpenid(openid, e.targetProfileId, e.type, getDb());
  } catch (e) {
    console.error('[interact] failed:', e);
    return { error: 'internal error' };
  }
};
exports.interactByOpenid = interactByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
```

（注：`getDb` 放文件末尾避免顶层初始化，与既有云函数惰性模式一致。）

新建 `cloudfunctions/interact/package.json`：

```json
{
  "name": "interact",
  "version": "1.0.0",
  "description": "心动/无感：态度 upsert + 互配检测 + 通知",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  },
  "private": true
}
```

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/interact.test.js && npm test`
Expected: 全绿（interact 5 用例）

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/interact tests/integration/interact.test.js
git commit -m "feat(cloud): interact 云函数（心动/无感 upsert + 互配检测 + like/match 通知）"
```

---

### Task 3: listProfiles 无感排除 + filter-panel min>max 钳制

**Files:**
- Modify: `cloudfunctions/listProfiles/index.js`（listProfilesByOpenid 查询段）
- Modify: `tests/integration/listProfiles.test.js`（追加 2 用例）
- Modify: `miniprogram/components/filter-panel/index.js`（buildFilter 钳制）
- Modify: `tests/unit/filter-panel.test.js`（追加 1 用例）

**Interfaces:**
- Consumes: T2 的 interactions 文档形状（`{ fromOpenid, targetId, type }`）
- Produces: listProfiles 结果自动排除调用方 pass 过的嘉宾（分页语义精确：补偿取回 + 内存过滤 + 内存切页）；filter-panel `buildFilter` 保证 `ageMin<=ageMax`、`heightMin<=heightMax`（自动交换）

- [ ] **Step 1: 写失败测试（listProfiles）**

`tests/integration/listProfiles.test.js` 追加（`createMockDb`/`profile` 工厂均为文件内已有）：

```js
  test('无感排除：pass 过的嘉宾不出现在任何页（含跨页精确性）', async () => {
    const initial = { profiles: {}, users: {}, interactions: {
      i1: { _id: 'i1', fromOpenid: 'o-viewer', targetId: 'px0', targetOpenid: 'o-x0', type: 'pass', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' },
    } };
    for (let i = 0; i < 5; i += 1) {
      const id = 'px' + i;
      initial.profiles[id] = profile(id, 'o-x' + i, '2026-08-0' + (i + 1) + 'T00:00:00Z');
    }
    const db = createMockDb(initial);
    const p1 = await listProfilesByOpenid('o-viewer', {}, 1, 2, db);
    expect(p1.list.map((x) => x._id)).toEqual(['px4', 'px3']); // px0 被排除
    expect(p1.hasMore).toBe(true);
    const p2 = await listProfilesByOpenid('o-viewer', {}, 2, 2, db);
    expect(p2.list.map((x) => x._id)).toEqual(['px2', 'px1']);
    expect(p2.hasMore).toBe(false);
  });

  test('like 过的嘉宾不排除（仅 pass 排除）', async () => {
    const db = createMockDb({
      profiles: { pA: profile('pA', 'o-a', '2026-08-01T00:00:00Z') },
      interactions: { i1: { _id: 'i1', fromOpenid: 'o-viewer', targetId: 'pA', targetOpenid: 'o-a', type: 'like', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' } },
    });
    const res = await listProfilesByOpenid('o-viewer', {}, 1, 10, db);
    expect(res.list.map((x) => x._id)).toEqual(['pA']);
  });
```

- [ ] **Step 2: 写失败测试（filter-panel 钳制）**

`tests/unit/filter-panel.test.js` 的 describe 末尾追加：

```js
  test('min>max 自动交换（年龄/身高）', () => {
    const comp = render();
    const spy = jest.fn();
    comp.instance.triggerEvent = spy;
    // 选 ageMin=40（下标 22）、ageMax=20（下标 2）；heightMin=200（下标 30）、heightMax=160（下标 10）
    comp.instance.onTapRange({ currentTarget: { dataset: { field: 'ageMin' } } });
    comp.instance.onRangeConfirm({ detail: { value: [40] } });
    comp.instance.onTapRange({ currentTarget: { dataset: { field: 'ageMax' } } });
    comp.instance.onRangeConfirm({ detail: { value: [20] } });
    comp.instance.onTapRange({ currentTarget: { dataset: { field: 'heightMin' } } });
    comp.instance.onRangeConfirm({ detail: { value: [200] } });
    comp.instance.onTapRange({ currentTarget: { dataset: { field: 'heightMax' } } });
    comp.instance.onRangeConfirm({ detail: { value: [160] } });
    comp.instance.onApply();
    expect(spy).toHaveBeenCalledWith('change', { filter: { ageMin: 20, ageMax: 40, heightMin: 160, heightMax: 200 } });
    comp.detach();
  });
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx jest -c tests/jest.config.js --selectProjects unit,integration tests/unit/filter-panel.test.js tests/integration/listProfiles.test.js`
Expected: FAIL——无感排除用例返回含 px0（5 条未过滤）；钳制用例 filter 值未交换。

- [ ] **Step 4: 实现 listProfiles 排除**

`cloudfunctions/listProfiles/index.js` 中将 `listProfilesByOpenid` 开头的 p/size 计算之后、`const got = await ...` 查询段替换为：

```js
  // 无感排除：取我的全部 pass 目标；云数据库无 nin，采用「超额取回 + 内存过滤 + 内存切页」
  // （补偿量 = 全量无感数，保证任意页窗口精确；skip 移除，统一从头取）
  const passed = await db.collection('interactions').where({ fromOpenid: openid, type: 'pass' }).get();
  const passedIds = new Set(passed.data.map((d) => d.targetId));
  const fetchLimit = (p - 1) * size + size + 1 + passedIds.size; // 页尾 + hasMore 探测 + 无感补偿
  const got = await db.collection('profiles')
    .where(buildWhere(db, filter, openid))
    .orderBy('createdAt', 'desc')
    .skip(0)
    .limit(fetchLimit)
    .get();
  const filtered = got.data.filter((r) => !passedIds.has(r._id));
  const hasMore = filtered.length > p * size;
  const rows = hasMore ? filtered.slice(0, p * size) : filtered;
  const pageRows = rows.slice((p - 1) * size, p * size);
```

并把后续 join 段的 `rows.map((r) => r.openid)` 改为 `pageRows.map((r) => r.openid)`、`rows.map((r) => toCardVO(...))` 改为 `pageRows.map((r) => toCardVO(...))`（原 hasMore/rows 变量名被替换，注意原 `const hasMore = got.data.length > size; const rows = hasMore ? got.data.slice(0, size) : got.data;` 两行删除）。

- [ ] **Step 5: 实现 filter-panel 钳制**

`miniprogram/components/filter-panel/index.js` 的 `buildFilter` 改为：

```js
    buildFilter() {
      const f = {};
      // 区间钳制：min>max 自动交换（云函数按区间查询，倒挂返回空集——前端兜底）
      let ageMin = this.data.selAgeMin === UNLIMITED ? null : this.data.selAgeMin;
      let ageMax = this.data.selAgeMax === UNLIMITED ? null : this.data.selAgeMax;
      if (ageMin !== null && ageMax !== null && ageMin > ageMax) {
        const t = ageMin; ageMin = ageMax; ageMax = t;
      }
      let heightMin = this.data.selHeightMin === UNLIMITED ? null : this.data.selHeightMin;
      let heightMax = this.data.selHeightMax === UNLIMITED ? null : this.data.selHeightMax;
      if (heightMin !== null && heightMax !== null && heightMin > heightMax) {
        const t = heightMin; heightMin = heightMax; heightMax = t;
      }
      if (ageMin !== null) f.ageMin = ageMin;
      if (ageMax !== null) f.ageMax = ageMax;
      if (heightMin !== null) f.heightMin = heightMin;
      if (heightMax !== null) f.heightMax = heightMax;
      if (this.data.selEducations.length) f.educations = this.data.selEducations;
      if (this.data.selEmotionalStatuses.length) f.emotionalStatuses = this.data.selEmotionalStatuses;
      if (this.data.selJobs.length) f.jobs = this.data.selJobs;
      if (this.data.selCities.length) f.cities = this.data.selCities;
      return f;
    },
```

- [ ] **Step 6: 跑测试确认通过 + 回归 + 提交**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 全绿（含 P2 既有 listProfiles 8 用例——种子无 interactions 时 passedIds 空集、行为不变）

```bash
git add cloudfunctions/listProfiles/index.js tests/integration/listProfiles.test.js miniprogram/components/filter-panel/index.js tests/unit/filter-panel.test.js
git commit -m "feat(cloud): listProfiles 无感排除（超额取回+内存切页）+ filter-panel 区间钳制（P2 终审遗留）"
```

---

### Task 4: requestConsent + respondConsent 云函数（授权流核心）

**Files:**
- Create: `cloudfunctions/requestConsent/index.js` + `package.json`、`cloudfunctions/respondConsent/index.js` + `package.json`
- Test: `tests/integration/consents.test.js`（新建，两函数合一文件）

**Interfaces:**
- Consumes: consents/notifications 文档形状；T1 的 notify 形状（镜像）
- Produces:
  - `requestConsentByOpenid(openid, ownerProfileId, field, db)` → `{ status, unchanged? }` 或 `{ error: 'invalid field' | 'login required' | 'not found' | 'cannot request self' }`。语义：无文档→pending+通知 owner；pending/approved→幂等返回；rejected/revoked→重新申请（置 pending+通知）
  - `respondConsentByOpenid(openid, consentId, action, db)` → `{ status }` 或 `{ error: 'invalid action' | 'login required' | 'not found' | 'forbidden' | 'invalid state' }`。action：`approve`（pending→approved）、`reject`（pending→rejected）、`revoke`（approved→revoked=撤销隐藏）
  - 状态机与 T5 的 consents 响应、T9 前端渲染、T11 通知文案直接对接

- [ ] **Step 1: 写失败测试**

新建 `tests/integration/consents.test.js`：

```js
// tests/integration/consents.test.js —— 授权流：requestConsent / respondConsent
const { createMockDb } = require('../helpers/mock-db.js');
const { requestConsentByOpenid } = require('../../cloudfunctions/requestConsent/index.js');
const { respondConsentByOpenid: respond } = require('../../cloudfunctions/respondConsent/index.js');

function seed() {
  return createMockDb({
    users: {
      uA: { _id: 'uA', openid: 'o-a', role: 'normal', guestNo: 'J0001' },
      uB: { _id: 'uB', openid: 'o-b', role: 'normal', guestNo: 'J0002' },
    },
    profiles: {
      pB: { _id: 'pB', openid: 'o-b', basicInit: true, basic: { guestNo: 'J0002', nickname: '小乙' }, about: {}, createdAt: '2026-08-01T00:00:00Z' },
    },
    consents: {},
    notifications: {},
  });
}

describe('cloudfunctions/requestConsent', () => {
  test('游客/非法 field/目标不存在/自己 → 对应 error', async () => {
    const db = seed();
    expect(await requestConsentByOpenid('o-x', 'pB', 'contact', db)).toEqual({ error: 'login required' });
    expect(await requestConsentByOpenid('o-a', 'pB', 'salary', db)).toEqual({ error: 'invalid field' });
    expect(await requestConsentByOpenid('o-a', 'p-nope', 'contact', db)).toEqual({ error: 'not found' });
    await db.collection('profiles').add({ data: { _id: 'pA', openid: 'o-a', basicInit: true, basic: {}, about: {}, createdAt: '2026-08-01T00:00:00Z' } });
    expect(await requestConsentByOpenid('o-a', 'pA', 'contact', db)).toEqual({ error: 'cannot request self' });
  });

  test('首次申请：pending + owner 收 consent_request 通知（含 consentId/field/快照）', async () => {
    const db = seed();
    const res = await requestConsentByOpenid('o-a', 'pB', 'contact', db);
    expect(res).toEqual({ status: 'pending' });
    const docs = await db.collection('consents').where({ requesterOpenid: 'o-a', ownerOpenid: 'o-b' }).get();
    expect(docs.data).toHaveLength(1);
    expect(docs.data[0].field).toBe('contact');
    const notes = await db.collection('notifications').where({ toOpenid: 'o-b' }).get();
    expect(notes.data).toHaveLength(1);
    expect(notes.data[0].type).toBe('consent_request');
    expect(notes.data[0].payload.field).toBe('contact');
    expect(notes.data[0].payload.consentId).toBe(docs.data[0]._id);
    expect(notes.data[0].payload.guestNo).toBe('J0001');
  });

  test('pending/approved 幂等（不重复通知）；rejected/revoked 可重新申请', async () => {
    const db = seed();
    await requestConsentByOpenid('o-a', 'pB', 'contact', db);
    const again = await requestConsentByOpenid('o-a', 'pB', 'contact', db);
    expect(again).toEqual({ status: 'pending', unchanged: true });
    const notes1 = await db.collection('notifications').where({ toOpenid: 'o-b' }).get();
    expect(notes1.data).toHaveLength(1);
    const doc = (await db.collection('consents').where({ requesterOpenid: 'o-a' }).get()).data[0];
    await respond(db, 'o-b', doc._id, 'approve');
    const approved = await requestConsentByOpenid('o-a', 'pB', 'contact', db);
    expect(approved).toEqual({ status: 'approved', unchanged: true });
    await respond(db, 'o-b', doc._id, 'revoke');
    const reapplied = await requestConsentByOpenid('o-a', 'pB', 'contact', db);
    expect(reapplied).toEqual({ status: 'pending' }); // revoked → 重新申请
    const docs = await db.collection('consents').where({ requesterOpenid: 'o-a' }).get();
    expect(docs.data).toHaveLength(1); // 复用同文档
  });
});

describe('cloudfunctions/respondConsent', () => {
  async function pendingConsent(db) {
    await requestConsentByOpenid('o-a', 'pB', 'asset', db);
    return (await db.collection('consents').where({ requesterOpenid: 'o-a' }).get()).data[0];
  }

  test('非 owner → forbidden；游客 → login required；非法 action/不存在 → 对应 error', async () => {
    const db = seed();
    const doc = await pendingConsent(db);
    expect(await respond(db, 'o-x', doc._id, 'approve')).toEqual({ error: 'login required' });
    expect(await respond(db, 'o-a', doc._id, 'approve')).toEqual({ error: 'forbidden' });
    expect(await respond(db, 'o-b', doc._id, 'wave')).toEqual({ error: 'invalid action' });
    expect(await respond(db, 'o-b', 'c-nope', 'approve')).toEqual({ error: 'not found' });
  });

  test('approve：pending→approved + requester 收 consent_result(approved)', async () => {
    const db = seed();
    const doc = await pendingConsent(db);
    const res = await respond(db, 'o-b', doc._id, 'approve');
    expect(res).toEqual({ status: 'approved' });
    const after = (await db.collection('consents').doc(doc._id).get()).data;
    expect(after.status).toBe('approved');
    expect(after.decidedAt).toBeTruthy();
    const notes = await db.collection('notifications').where({ toOpenid: 'o-a' }).get();
    expect(notes.data).toHaveLength(1);
    expect(notes.data[0].type).toBe('consent_result');
    expect(notes.data[0].payload).toMatchObject({ field: 'asset', status: 'approved' });
  });

  test('状态机：reject 仅 pending；revoke 仅 approved；违例 → invalid state', async () => {
    const db = seed();
    const doc = await pendingConsent(db);
    expect(await respond(db, 'o-b', doc._id, 'revoke')).toEqual({ error: 'invalid state' });
    await respond(db, 'o-b', doc._id, 'approve');
    expect(await respond(db, 'o-b', doc._id, 'approve')).toEqual({ error: 'invalid state' });
    expect(await respond(db, 'o-b', doc._id, 'reject')).toEqual({ error: 'invalid state' });
    const revoked = await respond(db, 'o-b', doc._id, 'revoke'); // 撤销：字段重新隐藏
    expect(revoked).toEqual({ status: 'revoked' });
  });
});
```

（注：文件顶部同时 require 两个函数；测试内 `respond` 即 `respondConsentByOpenid` 别名，`requestConsentByOpenid` 从 requestConsent 模块导出。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/consents.test.js`
Expected: FAIL——两个模块均 `Cannot find module`

- [ ] **Step 3: 实现 requestConsent**

新建 `cloudfunctions/requestConsent/index.js`：

```js
// requestConsent 云函数 —— 申请查看隐私字段（contact/asset）
// 入参 { ownerProfileId, field }；返回 { status, unchanged? } 或 { error }。
// 幂等：pending/approved 重复申请原样返回；rejected/revoked 重新申请（复用同文档）。
// 每次有效申请（新建或重新申请）通知 owner（consent_request）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const FIELDS = ['contact', 'asset'];

async function notify(db, toOpenid, type, payload) {
  await db.collection('notifications').add({
    data: { toOpenid, type, payload, read: false, createdAt: new Date().toISOString() },
  });
}

async function requestConsentByOpenid(openid, ownerProfileId, field, db) {
  if (FIELDS.indexOf(field) < 0) return { error: 'invalid field' };
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const me = meArr.data[0];

  let owner;
  try {
    owner = (await db.collection('profiles').doc(ownerProfileId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }
  if (!owner.basicInit) return { error: 'not found' };
  if (owner.openid === openid) return { error: 'cannot request self' };

  const consents = db.collection('consents');
  const existingArr = await consents.where({ requesterOpenid: openid, ownerOpenid: owner.openid, field }).get();
  const existing = existingArr.data[0];
  const now = new Date().toISOString();

  if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
    return { status: existing.status, unchanged: true };
  }

  // requester 快照（通知展示用）
  const myProfileArr = await db.collection('profiles').where({ openid }).get();
  const myBasic = (myProfileArr.data[0] && myProfileArr.data[0].basic) || {};
  const payload = {
    consentId: existing ? existing._id : null,
    field,
    nickname: myBasic.nickname || '',
    guestNo: myBasic.guestNo || me.guestNo || '',
    profileId: myProfileArr.data[0] ? myProfileArr.data[0]._id : null,
  };

  if (existing) {
    // rejected/revoked → 重新申请
    await consents.doc(existing._id).update({ data: { status: 'pending', updatedAt: now, decidedAt: null } });
    payload.consentId = existing._id;
    await notify(db, owner.openid, 'consent_request', payload);
    return { status: 'pending' };
  }
  const added = await consents.add({
    data: {
      requesterOpenid: openid, ownerOpenid: owner.openid, field,
      status: 'pending', createdAt: now, updatedAt: now, decidedAt: null,
    },
  });
  payload.consentId = added._id;
  await notify(db, owner.openid, 'consent_request', payload);
  return { status: 'pending' };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    const e = event || {};
    return await requestConsentByOpenid(openid, e.ownerProfileId, e.field, getDb());
  } catch (e) {
    console.error('[requestConsent] failed:', e);
    return { error: 'internal error' };
  }
};
exports.requestConsentByOpenid = requestConsentByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
```

新建 `cloudfunctions/requestConsent/package.json`（同模板，name `requestConsent`，description「申请查看隐私字段」）。

- [ ] **Step 4: 实现 respondConsent**

新建 `cloudfunctions/respondConsent/index.js`：

```js
// respondConsent 云函数 —— owner 处理授权：approve（pending→approved）/ reject（pending→rejected）
// / revoke（approved→revoked，撤销后字段重新隐藏）。每次有效决定通知 requester（consent_result）。
// 入参 { consentId, action }；返回 { status } 或 { error }。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const ACTIONS = {
  approve: { from: 'pending', to: 'approved' },
  reject: { from: 'pending', to: 'rejected' },
  revoke: { from: 'approved', to: 'revoked' },
};

async function notify(db, toOpenid, type, payload) {
  await db.collection('notifications').add({
    data: { toOpenid, type, payload, read: false, createdAt: new Date().toISOString() },
  });
}

async function respondConsentByOpenid(openid, consentId, action, db) {
  const rule = ACTIONS[action];
  if (!rule) return { error: 'invalid action' };
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };

  let consent;
  try {
    consent = (await db.collection('consents').doc(consentId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }
  if (consent.ownerOpenid !== openid) return { error: 'forbidden' };
  if (consent.status !== rule.from) return { error: 'invalid state' };

  const now = new Date().toISOString();
  await db.collection('consents').doc(consentId).update({
    data: { status: rule.to, updatedAt: now, decidedAt: now },
  });

  // owner 快照（通知展示用）
  const ownerProfileArr = await db.collection('profiles').where({ openid }).get();
  const ob = (ownerProfileArr.data[0] && ownerProfileArr.data[0].basic) || {};
  await notify(db, consent.requesterOpenid, 'consent_result', {
    field: consent.field,
    status: rule.to,
    nickname: ob.nickname || '',
    guestNo: ob.guestNo || meArr.data[0].guestNo || '',
    profileId: ownerProfileArr.data[0] ? ownerProfileArr.data[0]._id : null,
  });
  return { status: rule.to };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    const e = event || {};
    return await respondConsentByOpenid(openid, e.consentId, e.action, getDb());
  } catch (e) {
    console.error('[respondConsent] failed:', e);
    return { error: 'internal error' };
  }
};
exports.respondConsentByOpenid = respondConsentByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
```

新建 `cloudfunctions/respondConsent/package.json`（name `respondConsent`，description「处理隐私授权：同意/拒绝/撤销」）。

- [ ] **Step 5: 跑测试确认通过 + 回归 + 提交**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/consents.test.js && npm test`
Expected: 全绿（consents 6 用例）

```bash
git add cloudfunctions/requestConsent cloudfunctions/respondConsent tests/integration/consents.test.js
git commit -m "feat(cloud): 隐私授权流（requestConsent/respondConsent：状态机+双方通知+撤销）"
```

---

### Task 5: getProfileDetail 隐私按授权解锁 + consents 状态响应

**Files:**
- Modify: `cloudfunctions/getProfileDetail/index.js`
- Modify: `tests/integration/getProfileDetail.test.js`（追加 2 用例）

**Interfaces:**
- Consumes: T4 的 consents 文档与状态机
- Produces: 成功响应新增 `consents: { contact, asset }`（self/admin 恒 `approved`）；非 self/admin 且该字段 approved 时 `profile.privacy` 附对应子段（`privacy.contact` / `privacy.asset`，仅解锁的子段）。T9 前端渲染依赖。

- [ ] **Step 1: 写失败测试**

`tests/integration/getProfileDetail.test.js` 追加：

```js
  test('consents 状态响应：self/admin 恒 approved；普通用户默认 none', async () => {
    const db = seed({ normal: 5, verified: 15 });
    const self = await getProfileDetailByOpenid('o-owner', 'p-o-owner', db);
    expect(self.consents).toEqual({ contact: 'approved', asset: 'approved' });
    const admin = await getProfileDetailByOpenid('o-admin', 'p-o-t3', db);
    expect(admin.consents).toEqual({ contact: 'approved', asset: 'approved' });
    const normal = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(normal.consents).toEqual({ contact: 'none', asset: 'none' });
    expect(normal.profile.privacy).toBeUndefined();
  });

  test('approved 字段解锁对应隐私子段；rejected/revoked/pending 不解锁', async () => {
    const db = seed({ normal: 5, verified: 15 });
    const consents = db.collection('consents');
    await consents.add({ data: { requesterOpenid: 'o-normal', ownerOpenid: 'o-t3', field: 'contact', status: 'approved', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', decidedAt: '2026-08-01T00:00:00Z' } });
    await consents.add({ data: { requesterOpenid: 'o-normal', ownerOpenid: 'o-t3', field: 'asset', status: 'revoked', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z', decidedAt: '2026-08-02T00:00:00Z' } });
    const res = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(res.consents).toEqual({ contact: 'approved', asset: 'revoked' });
    expect(res.profile.privacy).toEqual({ contact: { phone: '13800000000', wechat: 'wx-abc' } }); // 仅解锁子段
    // 复看路径同样生效
    const again = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(again.profile.privacy.contact.phone).toBe('13800000000');
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/getProfileDetail.test.js`
Expected: FAIL——consents 键不存在（undefined）、privacy 未附。

- [ ] **Step 3: 实现**

`cloudfunctions/getProfileDetail/index.js` 改动三处。

(1) `toFullVO` 之后追加：

```js
// 非 self/admin 视角：按 consents 状态组装 consents 响应与解锁的隐私子段
async function buildConsentView(db, openid, target) {
  const arr = await db.collection('consents')
    .where({ requesterOpenid: openid, ownerOpenid: target.openid }).get();
  const status = { contact: 'none', asset: 'none' };
  for (const c of arr.data) status[c.field] = c.status;
  const privacy = {};
  const src = target.privacy || {};
  if (status.contact === 'approved') privacy.contact = src.contact || {};
  if (status.asset === 'approved') privacy.asset = src.asset || {};
  return { status, privacy: (privacy.contact || privacy.asset) ? privacy : undefined };
}
```

(2) self 与 admin 两个 return 各加一个键：

```js
    return { profile: toFullVO(target, targetRole), verified: isVerified, self: true, quota: null, consents: { contact: 'approved', asset: 'approved' } };
```

```js
    return { profile: toFullVO(target, targetRole), verified: isVerified, self: false, quota: { used: 0, limit: -1 }, consents: { contact: 'approved', asset: 'approved' } };
```

(3) 两处普通用户 return（复看路径与新看路径）改为先取 `const cv = await buildConsentView(db, openid, target);`，返回值改用：

```js
  return { profile: withConsentPrivacy(toCardVO(target, targetRole), cv), verified: isVerified, self: false, quota: { used: seen.size, limit }, consents: cv.status };
```

```js
  return { profile: withConsentPrivacy(toCardVO(target, targetRole), cv), verified: isVerified, self: false, quota: { used: acquired.used, limit }, consents: cv.status };
```

并在 `buildConsentView` 旁追加小函数：

```js
function withConsentPrivacy(vo, cv) {
  if (cv.privacy) vo.privacy = cv.privacy;
  return vo;
}
```

（复看路径的 `const cv = await buildConsentView(...)` 放在 `if (seen.has(profileId))` 之前，两路共用。）

- [ ] **Step 4: 跑测试确认通过 + 回归 + 提交**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/getProfileDetail.test.js && npm test`
Expected: 全绿（既有用例不含 consents 断言，不受影响）

```bash
git add cloudfunctions/getProfileDetail/index.js tests/integration/getProfileDetail.test.js
git commit -m "feat(cloud): getProfileDetail 隐私按授权解锁（consents 状态响应 + 分字段 privacy）"
```

---

### Task 6: getInteractions 云函数（谁看过我 / 喜欢我的）

**Files:**
- Create: `cloudfunctions/getInteractions/index.js` + `package.json`
- Test: `tests/integration/getInteractions.test.js`（新建）

**Interfaces:**
- Consumes: view_logs 文档（P2 形状）、T2 interactions 文档
- Produces: `getInteractionsByOpenid(openid, type, db)`，type ∈ `view|like`，返回 `{ type, list }`；item：`{ profileId, nickname, avatarFileID, guestNo, verified, matched, at }`（matched 仅 type=like 时有意义=对方喜欢我且我也喜欢对方；view 按 viewer 去重保最新；仅返回 basicInit 的嘉宾）。T11 interaction-list 页消费。

- [ ] **Step 1: 写失败测试**

新建 `tests/integration/getInteractions.test.js`：

```js
// tests/integration/getInteractions.test.js —— 谁看过我 / 喜欢我的
const { createMockDb } = require('../helpers/mock-db.js');
const { getInteractionsByOpenid } = require('../../cloudfunctions/getInteractions/index.js');

function seed() {
  return createMockDb({
    users: {
      uMe: { _id: 'uMe', openid: 'o-me', role: 'normal', guestNo: 'J0001' },
      uA: { _id: 'uA', openid: 'o-a', role: 'verified', guestNo: 'J0002' },
      uB: { _id: 'uB', openid: 'o-b', role: 'normal', guestNo: 'J0003' },
      uC: { _id: 'uC', openid: 'o-c', role: 'normal', guestNo: 'J0004' }, // 无资料
    },
    profiles: {
      pMe: { _id: 'pMe', openid: 'o-me', basicInit: true, basic: { guestNo: 'J0001', nickname: '我' }, about: {}, createdAt: '2026-08-01T00:00:00Z' },
      pA: { _id: 'pA', openid: 'o-a', basicInit: true, basic: { guestNo: 'J0002', nickname: '小甲', avatarFileID: 'cloud://a.jpg' }, about: {}, createdAt: '2026-08-02T00:00:00Z' },
      pB: { _id: 'pB', openid: 'o-b', basicInit: true, basic: { guestNo: 'J0003', nickname: '小乙' }, about: {}, createdAt: '2026-08-03T00:00:00Z' },
    },
    view_logs: {
      v1: { _id: 'v1', viewerOpenid: 'o-a', viewerId: 'uA', targetId: 'pMe', targetOpenid: 'o-me', dateKey: '2026-08-20', createdAt: '2026-08-20T01:00:00Z' },
      v2: { _id: 'v2', viewerOpenid: 'o-a', viewerId: 'uA', targetId: 'pMe', targetOpenid: 'o-me', dateKey: '2026-08-19', createdAt: '2026-08-19T01:00:00Z' }, // 同人再看
      v3: { _id: 'v3', viewerOpenid: 'o-c', viewerId: 'uC', targetId: 'pMe', targetOpenid: 'o-me', dateKey: '2026-08-20', createdAt: '2026-08-20T02:00:00Z' }, // 无资料
    },
    interactions: {
      iA: { _id: 'iA', fromOpenid: 'o-a', fromUserId: 'uA', targetId: 'pMe', targetOpenid: 'o-me', type: 'like', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' },
      iB: { _id: 'iB', fromOpenid: 'o-b', fromUserId: 'uB', targetId: 'pMe', targetOpenid: 'o-me', type: 'like', createdAt: '2026-08-20T03:00:00Z', updatedAt: '2026-08-20T03:00:00Z' },
      iMeA: { _id: 'iMeA', fromOpenid: 'o-me', fromUserId: 'uMe', targetId: 'pA', targetOpenid: 'o-a', type: 'like', createdAt: '2026-08-20T04:00:00Z', updatedAt: '2026-08-20T04:00:00Z' }, // 我也喜欢小甲 → matched
    },
  });
}

describe('cloudfunctions/getInteractions', () => {
  test('游客/非法 type → error', async () => {
    const db = seed();
    expect(await getInteractionsByOpenid('o-x', 'view', db)).toEqual({ error: 'login required' });
    expect(await getInteractionsByOpenid('o-me', 'wave', db)).toEqual({ error: 'invalid type' });
  });

  test('谁看过我：按 viewer 去重保最新、join 资料快照、无资料者剔除、verified 标记', async () => {
    const db = seed();
    const res = await getInteractionsByOpenid('o-me', 'view', db);
    expect(res.type).toBe('view');
    expect(res.list).toHaveLength(1); // o-a 去重、o-c 无资料剔除
    expect(res.list[0]).toEqual({
      profileId: 'pA', nickname: '小甲', avatarFileID: 'cloud://a.jpg',
      guestNo: 'J0002', verified: true, matched: false,
      at: '2026-08-20T01:00:00Z', // 最新一次
    });
  });

  test('喜欢我的：matched 标记（我也喜欢对方）；无感的不出现', async () => {
    const db = seed();
    await db.collection('interactions').doc('iB').update({ data: { type: 'pass' } });
    const res = await getInteractionsByOpenid('o-me', 'like', db);
    expect(res.list).toHaveLength(1); // 小乙改无感后剔除
    expect(res.list[0].nickname).toBe('小甲');
    expect(res.list[0].matched).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/getInteractions.test.js`
Expected: FAIL——`Cannot find module`

- [ ] **Step 3: 实现**

新建 `cloudfunctions/getInteractions/index.js`：

```js
// getInteractions 云函数 —— 谁看过我（view_logs 倒序去重）/ 喜欢我的（interactions like）
// 入参 { type: 'view' | 'like' }；返回 { type, list }，item 见 T6 Interfaces。
// 仅返回 basicInit 嘉宾；matched = 对方喜欢我且我也喜欢对方（仅 like 有意义）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const VERIFIED_ROLES = ['verified', 'admin'];

async function getInteractionsByOpenid(openid, type, db) {
  if (type !== 'view' && type !== 'like') return { error: 'invalid type' };
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };

  let rows; // [{ openid, at }]
  if (type === 'view') {
    const logs = await db.collection('view_logs')
      .where({ targetOpenid: openid }).orderBy('createdAt', 'desc').limit(100).get();
    const byViewer = new Map(); // 去重保最新（倒序首见即最新）
    for (const l of logs.data) {
      if (!byViewer.has(l.viewerOpenid)) byViewer.set(l.viewerOpenid, { openid: l.viewerOpenid, at: l.createdAt });
    }
    rows = Array.from(byViewer.values());
  } else {
    const likes = await db.collection('interactions')
      .where({ targetOpenid: openid, type: 'like' }).orderBy('updatedAt', 'desc').limit(100).get();
    rows = likes.data.map((d) => ({ openid: d.fromOpenid, at: d.updatedAt }));
  }

  // join profiles（basicInit）与 users（verified）
  const openids = rows.map((r) => r.openid);
  const profileMap = {};
  const roleMap = {};
  if (openids.length > 0) {
    const _ = db.command;
    const ps = await db.collection('profiles').where({ openid: _.in(openids), basicInit: true }).get();
    for (const pf of ps.data) profileMap[pf.openid] = pf;
    const us = await db.collection('users').where({ openid: _.in(openids) }).get();
    for (const u of us.data) roleMap[u.openid] = u.role;
  }

  // matched：我也喜欢对方（仅 like）
  const myLikes = new Set();
  if (type === 'like' && openids.length > 0) {
    const mine = await db.collection('interactions').where({ fromOpenid: openid, type: 'like' }).get();
    for (const d of mine.data) myLikes.add(d.targetOpenid);
  }

  const list = rows
    .filter((r) => profileMap[r.openid])
    .map((r) => {
      const b = profileMap[r.openid].basic || {};
      return {
        profileId: profileMap[r.openid]._id,
        nickname: b.nickname || '',
        avatarFileID: b.avatarFileID || '',
        guestNo: b.guestNo || '',
        verified: VERIFIED_ROLES.indexOf(roleMap[r.openid]) >= 0,
        matched: type === 'like' && myLikes.has(r.openid),
        at: r.at,
      };
    });
  return { type, list };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    return await getInteractionsByOpenid(openid, (event || {}).type, getDb());
  } catch (e) {
    console.error('[getInteractions] failed:', e);
    return { error: 'internal error' };
  }
};
exports.getInteractionsByOpenid = getInteractionsByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
```

新建 `cloudfunctions/getInteractions/package.json`（name `getInteractions`，description「谁看过我/喜欢我的」）。

- [ ] **Step 4: 跑测试确认通过 + 回归 + 提交**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/getInteractions.test.js && npm test`
Expected: 全绿（3 用例）

```bash
git add cloudfunctions/getInteractions tests/integration/getInteractions.test.js
git commit -m "feat(cloud): getInteractions 云函数（谁看过我去重/喜欢我的 matched 标记）"
```

---

### Task 7: getNotifications + markRead 云函数

**Files:**
- Create: `cloudfunctions/getNotifications/index.js` + `package.json`、`cloudfunctions/markRead/index.js` + `package.json`
- Test: `tests/integration/notifications.test.js`（新建，两函数合一文件）

**Interfaces:**
- Consumes: notifications 文档形状（T1/T2/T4 写入）
- Produces:
  - `getNotificationsByOpenid(openid, db)` → `{ list, unread }`（倒序 50 条，VO 原样直出含 `_id`）
  - `markReadByOpenid(openid, ids, all, db)` → `{ updated }`（ids 数组或 all=true；仅能操作自己名下未读）
  - T11 message 页消费。

- [ ] **Step 1: 写失败测试**

新建 `tests/integration/notifications.test.js`：

```js
// tests/integration/notifications.test.js —— 通知读取与已读标记
const { createMockDb } = require('../helpers/mock-db.js');
const { getNotificationsByOpenid } = require('../../cloudfunctions/getNotifications/index.js');
const { markReadByOpenid } = require('../../cloudfunctions/markRead/index.js');

function seed() {
  return createMockDb({
    users: { uA: { _id: 'uA', openid: 'o-a', role: 'normal', guestNo: 'J0001' } },
    notifications: {
      n1: { _id: 'n1', toOpenid: 'o-a', type: 'like', payload: { nickname: '小乙' }, read: false, createdAt: '2026-08-20T01:00:00Z' },
      n2: { _id: 'n2', toOpenid: 'o-a', type: 'match', payload: { nickname: '小丙' }, read: false, createdAt: '2026-08-20T02:00:00Z' },
      n3: { _id: 'n3', toOpenid: 'o-a', type: 'view', payload: { nickname: '小丁' }, read: true, createdAt: '2026-08-20T03:00:00Z' },
      n4: { _id: 'n4', toOpenid: 'o-b', type: 'like', payload: {}, read: false, createdAt: '2026-08-20T04:00:00Z' },
    },
  });
}

describe('cloudfunctions/notifications', () => {
  test('游客 → login required（两函数）', async () => {
    const db = seed();
    expect(await getNotificationsByOpenid('o-x', db)).toEqual({ error: 'login required' });
    expect(await markReadByOpenid('o-x', ['n1'], false, db)).toEqual({ error: 'login required' });
  });

  test('列表倒序 50 条 + unread 计数', async () => {
    const db = seed();
    const res = await getNotificationsByOpenid('o-a', db);
    expect(res.list.map((n) => n._id)).toEqual(['n3', 'n2', 'n1']); // createdAt 倒序
    expect(res.unread).toBe(2);
  });

  test('markRead 按 ids：仅自己名下且未读的生效；已读重复标记不计数', async () => {
    const db = seed();
    const res = await markReadByOpenid('o-a', ['n1', 'n3', 'n4'], false, db); // n3 已读、n4 他人
    expect(res).toEqual({ updated: 1 });
    const after = await db.collection('notifications').doc('n1').get();
    expect(after.data.read).toBe(true);
    const again = await markReadByOpenid('o-a', ['n1'], false, db);
    expect(again).toEqual({ updated: 0 });
  });

  test('markRead all=true：全部未读置已读', async () => {
    const db = seed();
    const res = await markReadByOpenid('o-a', null, true, db);
    expect(res).toEqual({ updated: 2 });
    const list = await getNotificationsByOpenid('o-a', db);
    expect(list.unread).toBe(0);
  });

  test('空入参 → updated 0（不报错）', async () => {
    const res = await markReadByOpenid('o-a', [], false, seed());
    expect(res).toEqual({ updated: 0 });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/notifications.test.js`
Expected: FAIL——两个模块均不存在

- [ ] **Step 3: 实现 getNotifications**

新建 `cloudfunctions/getNotifications/index.js`：

```js
// getNotifications 云函数 —— 我的通知列表（倒序 50 条 + 未读数）
// 入参无；返回 { list, unread }。payload 为写入时快照（T1/T2/T4 的 notify 保持同构）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

async function getNotificationsByOpenid(openid, db) {
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const res = await db.collection('notifications')
    .where({ toOpenid: openid }).orderBy('createdAt', 'desc').limit(50).get();
  return { list: res.data, unread: res.data.filter((n) => !n.read).length };
}

exports.main = async () => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    return await getNotificationsByOpenid(cloud.getWXContext().OPENID, getDb());
  } catch (e) {
    console.error('[getNotifications] failed:', e);
    return { error: 'internal error' };
  }
};
exports.getNotificationsByOpenid = getNotificationsByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
```

新建 `cloudfunctions/getNotifications/package.json`（name `getNotifications`，description「我的通知列表」）。

- [ ] **Step 4: 实现 markRead**

新建 `cloudfunctions/markRead/index.js`：

```js
// markRead 云函数 —— 通知已读标记
// 入参 { ids?: string[], all?: boolean }；仅操作自己名下未读，返回 { updated }。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

async function markReadByOpenid(openid, ids, all, db) {
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const col = db.collection('notifications');
  const mine = await col.where({ toOpenid: openid }).get();

  let targets;
  if (all) {
    targets = mine.data.filter((n) => !n.read);
  } else if (Array.isArray(ids) && ids.length > 0) {
    const idSet = new Set(ids);
    targets = mine.data.filter((n) => idSet.has(n._id) && !n.read);
  } else {
    return { updated: 0 };
  }
  for (const n of targets) {
    await col.doc(n._id).update({ data: { read: true } });
  }
  return { updated: targets.length };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const e = event || {};
    return await markReadByOpenid(cloud.getWXContext().OPENID, e.ids, !!e.all, getDb());
  } catch (e) {
    console.error('[markRead] failed:', e);
    return { error: 'internal error' };
  }
};
exports.markReadByOpenid = markReadByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
```

新建 `cloudfunctions/markRead/package.json`（name `markRead`，description「通知已读标记」）。

- [ ] **Step 5: 跑测试确认通过 + 回归 + 提交**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/notifications.test.js && npm test`
Expected: 全绿（5 用例）

```bash
git add cloudfunctions/getNotifications cloudfunctions/markRead tests/integration/notifications.test.js
git commit -m "feat(cloud): 通知读取与已读标记（getNotifications/markRead）"
```

---

### Task 8: report 云函数 + options.js 举报选项池

**Files:**
- Create: `cloudfunctions/report/index.js` + `package.json`
- Modify: `miniprogram/utils/options.js`（追加 REPORT_TYPES 导出）
- Test: `tests/integration/report.test.js`（新建）、`tests/unit/options.test.js`（追加 1 断言）

**Interfaces:**
- Consumes: reports 文档形状；REPORT_TYPES 字面量（云函数/前端两份同步）
- Produces: `reportByOpenid(openid, { targetId, type, description, screenshotFileIDs }, db)` → `{ reported: true }` 或 `{ error: 'login required' | 'invalid type' | 'invalid description' | 'invalid screenshots' | 'not found' }`；`options.js` 导出 `REPORT_TYPES`。T10 举报页消费。

- [ ] **Step 1: 写失败测试**

新建 `tests/integration/report.test.js`：

```js
// tests/integration/report.test.js —— 举报提交（reports 落库，P4 处理）
const { createMockDb } = require('../helpers/mock-db.js');
const { reportByOpenid } = require('../../cloudfunctions/report/index.js');

function seed() {
  return createMockDb({
    users: { uA: { _id: 'uA', openid: 'o-a', role: 'normal', guestNo: 'J0001' } },
    profiles: {
      pB: { _id: 'pB', openid: 'o-b', basicInit: true, basic: {}, about: {}, createdAt: '2026-08-01T00:00:00Z' },
    },
    reports: {},
  });
}

describe('cloudfunctions/report', () => {
  test('游客 → login required；目标不存在 → not found', async () => {
    const db = seed();
    expect(await reportByOpenid('o-x', { targetId: 'pB', type: '诈骗行为', description: 'x' }, db))
      .toEqual({ error: 'login required' });
    expect(await reportByOpenid('o-a', { targetId: 'p-nope', type: '诈骗行为', description: 'x' }, db))
      .toEqual({ error: 'not found' });
  });

  test('字段校验：type 枚举 / description 必填 ≤200 / 截图 ≤3 张 fileID', async () => {
    const db = seed();
    expect(await reportByOpenid('o-a', { targetId: 'pB', type: '垃圾信息', description: 'x' }, db))
      .toEqual({ error: 'invalid type' });
    expect(await reportByOpenid('o-a', { targetId: 'pB', type: '诈骗行为', description: '' }, db))
      .toEqual({ error: 'invalid description' });
    expect(await reportByOpenid('o-a', { targetId: 'pB', type: '诈骗行为', description: 'x', screenshotFileIDs: ['a', 'b', 'c', 'd'] }, db))
      .toEqual({ error: 'invalid screenshots' });
    expect(await reportByOpenid('o-a', { targetId: 'pB', type: '诈骗行为', description: 'x', screenshotFileIDs: 'cloud://a' }, db))
      .toEqual({ error: 'invalid screenshots' });
  });

  test('合法提交：reports 落 pending + status/时间戳', async () => {
    const db = seed();
    const res = await reportByOpenid('o-a', {
      targetId: 'pB', type: '虚假资料', description: '照片与本人不符',
      screenshotFileIDs: ['cloud://s1.jpg'],
    }, db);
    expect(res).toEqual({ reported: true });
    const docs = await db.collection('reports').where({ reporterOpenid: 'o-a' }).get();
    expect(docs.data).toHaveLength(1);
    expect(docs.data[0]).toMatchObject({
      targetId: 'pB', targetOpenid: 'o-b', type: '虚假资料',
      description: '照片与本人不符', screenshotFileIDs: ['cloud://s1.jpg'], status: 'pending',
    });
    expect(docs.data[0].createdAt).toBeTruthy();
  });
});
```

`tests/unit/options.test.js` 末尾追加：

```js
test('REPORT_TYPES 举报选项池（与云函数 report 字面量同步）', () => {
  expect(options.REPORT_TYPES).toEqual(['虚假资料', '诈骗行为', '骚扰', '色情低俗', '其他']);
});
```

（若该文件以解构 require，按文件现状调整引用方式。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest -c tests/jest.config.js --selectProjects unit,integration tests/integration/report.test.js tests/unit/options.test.js`
Expected: FAIL——模块不存在；`options.REPORT_TYPES` undefined

- [ ] **Step 3: 实现**

`miniprogram/utils/options.js`：`const LIMITS = {` 之前插入：

```js
// 举报类型（与 cloudfunctions/report/index.js 的 REPORT_TYPES 字面量保持同步）
const REPORT_TYPES = ['虚假资料', '诈骗行为', '骚扰', '色情低俗', '其他'];
```

module.exports 追加 `REPORT_TYPES`。

新建 `cloudfunctions/report/index.js`：

```js
// report 云函数 —— 举报提交（reports 落库 pending，P4 管理页处理）
// 入参 { targetId, type, description, screenshotFileIDs? }；返回 { reported: true } 或 { error }。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const REPORT_TYPES = ['虚假资料', '诈骗行为', '骚扰', '色情低俗', '其他']; // 与 miniprogram/utils/options.js 同步
const DESC_MAX = 200;
const SHOTS_MAX = 3;

async function reportByOpenid(openid, body, db) {
  const meArr = await db.collection('users').where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const { targetId, type, description, screenshotFileIDs } = body || {};

  if (REPORT_TYPES.indexOf(type) < 0) return { error: 'invalid type' };
  if (typeof description !== 'string' || !description.trim() || description.length > DESC_MAX) {
    return { error: 'invalid description' };
  }
  const shots = screenshotFileIDs === undefined ? [] : screenshotFileIDs;
  if (!Array.isArray(shots) || shots.length > SHOTS_MAX || !shots.every((s) => typeof s === 'string' && s)) {
    return { error: 'invalid screenshots' };
  }

  let target;
  try {
    target = (await db.collection('profiles').doc(targetId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }

  await db.collection('reports').add({
    data: {
      reporterOpenid: openid, targetId, targetOpenid: target.openid,
      type, description: description.trim(), screenshotFileIDs: shots,
      status: 'pending', createdAt: new Date().toISOString(),
    },
  });
  return { reported: true };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    return await reportByOpenid(cloud.getWXContext().OPENID, event || {}, getDb());
  } catch (e) {
    console.error('[report] failed:', e);
    return { error: 'internal error' };
  }
};
exports.reportByOpenid = reportByOpenid;

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}
```

新建 `cloudfunctions/report/package.json`（name `report`，description「举报提交」）。

- [ ] **Step 4: 跑测试确认通过 + 回归 + 提交**

Run: `npx jest -c tests/jest.config.js --selectProjects unit,integration tests/integration/report.test.js tests/unit/options.test.js && npm test`
Expected: 全绿（report 3 用例 + options 1 断言）

```bash
git add cloudfunctions/report miniprogram/utils/options.js tests/integration/report.test.js tests/unit/options.test.js
git commit -m "feat(cloud): report 举报云函数（校验+落库 pending）+ 前端举报选项池"
```

---

### Task 9: profile-detail 页激活（心动/聊天/无感 + 隐私申请 + 错误区分 + 登录强刷）

**Files:**
- Modify: `miniprogram/pages/profile-detail/profile-detail.js`（重写）、`.wxml`（隐私区与按钮组重写）、`.wxss`（追加少量样式）、`.json`（不变，t-cell/t-button 已注册）

**Interfaces:**
- Consumes: T2 `interact`（`{ targetProfileId, type }` → `{ matched }`）、T4 两个 consents 函数、T5 响应的 `consents`/`privacy` 解锁语义、`utils/auth.js` 的 `clearLogin`
- Produces: 页面 data 新增 `loadError/consents/interacting/requesting`；`onLike/onPass/onChat/onRequestContact/onRequestAsset` 处理器（T12 e2e 直驱依赖）；游客重试强刷路径

- [ ] **Step 1: 重写 profile-detail.js**

整体替换 `miniprogram/pages/profile-detail/profile-detail.js`：

```js
// pages/profile-detail/profile-detail.js —— 嘉宾资料详情（遇见列表/分享落地进入）
// 状态优先级：needLogin（游客）> quotaExceeded > notFound > loadError > 正常渲染。
// P3：心动互配/无感/隐私申请/联系方式查看全部激活；聊天=解锁后展示并复制（导流微信，不自建 IM）。
const { callFunction } = require('../../utils/request.js');
const { ensureLogin, clearLogin } = require('../../utils/auth.js');

Page({
  data: {
    profile: null,
    verified: false,
    self: false,
    quota: null,
    consents: { contact: 'none', asset: 'none' }, // none/pending/approved/rejected/revoked
    needLogin: false,
    quotaExceeded: false,
    notFound: false,
    loadError: false,   // 云调用失败（网络/未部署），区别于 notFound（P2 终审遗留）
    profileId: '',
    interacting: false, // 按钮防重
    requesting: '',     // 正在申请的字段（contact/asset），防重
  },

  async onLoad(options) {
    const id = (options && options.id) || '';
    this.setData({ profileId: id });
    await this.loadDetail(id);
  },

  async loadDetail(id) {
    if (!id) {
      this.setData({ notFound: true });
      return;
    }
    const res = await callFunction('getProfileDetail', { profileId: id });
    if (!res) {
      // 云调用失败 ≠ 嘉宾不存在：单独状态，给重试入口
      this.setData({ loadError: true });
      return;
    }
    if (res.error === 'login required') {
      this.setData({ needLogin: true });
      return;
    }
    if (res.error === 'quota exceeded') {
      this.setData({ quotaExceeded: true, quota: res.quota || null });
      return;
    }
    if (res.error || !res.profile) {
      this.setData({ notFound: true });
      return;
    }
    this.setData({
      profile: res.profile,
      verified: !!res.verified,
      self: !!res.self,
      quota: res.quota || null,
      consents: res.consents || { contact: 'none', asset: 'none' },
      notFound: false,
      loadError: false,
    });
  },

  onRetryLoad() {
    this.setData({ loadError: false });
    this.loadDetail(this.data.profileId);
  },

  // 游客引导：静默登录后重试；缓存与服务端档不一致时强刷一次（P2 终审遗留）
  async onLoginRetry() {
    let user = await ensureLogin();
    this.setData({ needLogin: false });
    await this.loadDetail(this.data.profileId);
    if (!user || this.data.needLogin) {
      clearLogin();
      user = await ensureLogin(); // 强制走云函数 login 重建档
      if (user) {
        this.setData({ needLogin: false });
        await this.loadDetail(this.data.profileId);
      }
    }
    if (!user) {
      wx.showToast({ title: '登录失败，请稍后再试', icon: 'none' });
    }
  },

  // 心动：互配成功弹窗引导申请联系方式
  async onLike() {
    if (this.data.interacting) return;
    this.setData({ interacting: true });
    const res = await callFunction('interact', { targetProfileId: this.data.profileId, type: 'like' });
    this.setData({ interacting: false });
    if (!res || res.error) {
      wx.showToast({ title: '操作失败，请稍后再试', icon: 'none' });
      return;
    }
    if (res.matched) {
      const that = this;
      wx.showModal({
        title: '匹配成功！',
        content: '你们互相心动，可申请查看对方联系方式，交换后去微信聊天',
        confirmText: '申请联系方式',
        success: (m) => {
          if (m.confirm) that.onRequestConsent('contact');
        },
      });
    } else {
      wx.showToast({ title: '已心动，互相心动即匹配', icon: 'none' });
    }
  },

  // 无感：记录后返回列表（列表不再出现该嘉宾）
  async onPass() {
    if (this.data.interacting) return;
    this.setData({ interacting: true });
    const res = await callFunction('interact', { targetProfileId: this.data.profileId, type: 'pass' });
    this.setData({ interacting: false });
    if (!res || res.error) {
      wx.showToast({ title: '操作失败，请稍后再试', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已无感', icon: 'none' });
    setTimeout(() => wx.navigateBack({ fail: () => {} }), 600);
  },

  // 聊天：联系方式已解锁 → 展示并复制微信号；未解锁 → 引导互配（导流微信，不自建 IM）
  onChat() {
    const contact = this.data.profile && this.data.profile.privacy && this.data.profile.privacy.contact;
    if (contact && (contact.wechat || contact.phone)) {
      const text = contact.wechat || contact.phone;
      wx.showModal({
        title: '对方联系方式',
        content: '微信号：' + (contact.wechat || '未填写') + '\n手机号：' + (contact.phone || '未填写'),
        confirmText: '复制' + (contact.wechat ? '微信号' : '手机号'),
        success: (m) => {
          if (m.confirm) {
            wx.setClipboardData({ data: text, fail: () => {} });
          }
        },
      });
      return;
    }
    wx.showToast({ title: '互相心动后可申请查看联系方式', icon: 'none' });
  },

  // 隐私字段申请（field: contact | asset）
  async onRequestConsent(field) {
    if (this.data.requesting) return;
    this.setData({ requesting: field });
    const res = await callFunction('requestConsent', { ownerProfileId: this.data.profileId, field });
    this.setData({ requesting: '' });
    if (!res || res.error) {
      wx.showToast({ title: (res && res.error === 'cannot request self') ? '自己的资料无需申请' : '申请失败，请稍后再试', icon: 'none' });
      return;
    }
    this.setData({ ['consents.' + field]: res.status || 'pending' });
    wx.showToast({ title: res.status === 'approved' ? '对方已同意，已解锁' : '已发送申请，等待对方同意', icon: 'none' });
  },

  // 举报入口 → 举报表单页（T10 提供页面后接通；本任务先留跳转）
  onReport() {
    wx.navigateTo({ url: '/pages/report/report?id=' + this.data.profileId });
  },

  // 分享转发卡片：落地即本页（游客走登录引导）
  onShareAppMessage() {
    const p = this.data.profile;
    const name = (p && p.basic && p.basic.nickname) || '遇见爱';
    return {
      title: name + ' 的资料卡',
      path: '/pages/profile-detail/profile-detail?id=' + this.data.profileId,
    };
  },
});
```

- [ ] **Step 2: 重写 wxml 隐私区与状态区**

`miniprogram/pages/profile-detail/profile-detail.wxml` 中：

(1) `notFound` 状态卡之后追加一个状态（在 `<!-- 不存在 / 已下架 -->` 块之后、`<!-- 正常渲染 -->` 之前）：

```xml
  <!-- 加载失败（云调用异常，区别于不存在） -->
  <view class="detail__state" wx:elif="{{loadError}}">
    <t-empty description="加载失败，请检查网络后重试">
      <t-button slot="action" theme="primary" size="large" bind:tap="onRetryLoad">重新加载</t-button>
    </t-empty>
  </view>
```

(2) 隐私区整块（`<!-- 隐私区：… -->` 起至 `</view>`（detail__privacy 结束））替换为：

```xml
    <!-- 隐私区：self/admin 全量明文（未填写兜底）；他人已解锁子段明文；未解锁子段按 consents 状态给申请入口 -->
    <block wx:if="{{profile.privacy || self}}">
      <view class="detail__privacy">
        <t-cell-group theme="card">
          <t-cell wx:if="{{profile.privacy.contact || self}}" title="手机号" note="{{profile.privacy.contact.phone || '未填写'}}" />
          <t-cell wx:if="{{profile.privacy.contact || self}}" title="微信号" note="{{profile.privacy.contact.wechat || '未填写'}}" />
          <t-cell wx:if="{{profile.privacy.asset || self}}" title="房车情况" note="{{profile.privacy.asset.house || '未填写'}} · {{profile.privacy.asset.car || '未填写'}}" />
          <t-cell wx:if="{{profile.privacy.asset || self}}" title="收入" note="{{profile.privacy.asset.income || '未填写'}}" />
        </t-cell-group>
      </view>
    </block>
    <block wx:elif="{{!self}}">
      <view class="detail__privacy">
        <t-cell left-icon="user-locked" title="联系方式与资产" note="征求同意后可见" />
        <!-- 联系方式申请 -->
        <view class="detail__consent-row" wx:if="{{consents.contact !== 'approved'}}">
          <text class="detail__consent-label text-secondary">联系方式</text>
          <t-button wx:if="{{consents.contact === 'pending'}}" size="small" disabled>等待对方同意</t-button>
          <t-button wx:elif="{{consents.contact === 'rejected'}}" size="small" variant="outline" disabled>对方已拒绝</t-button>
          <t-button wx:else size="small" variant="outline" theme="primary"
                    loading="{{requesting === 'contact'}}" bind:tap="onRequestConsent" data-field="contact">
            {{consents.contact === 'revoked' ? '重新申请' : '申请查看'}}
          </t-button>
        </view>
        <!-- 资产申请 -->
        <view class="detail__consent-row" wx:if="{{consents.asset !== 'approved'}}">
          <text class="detail__consent-label text-secondary">资产信息</text>
          <t-button wx:if="{{consents.asset === 'pending'}}" size="small" disabled>等待对方同意</t-button>
          <t-button wx:elif="{{consents.asset === 'rejected'}}" size="small" variant="outline" disabled>对方已拒绝</t-button>
          <t-button wx:else size="small" variant="outline" theme="primary"
                    loading="{{requesting === 'asset'}}" bind:tap="onRequestConsent" data-field="asset">
            {{consents.asset === 'revoked' ? '重新申请' : '申请查看'}}
          </t-button>
        </view>
      </view>
    </block>
```

（`onRequestConsent` 由按钮 `data-field` 驱动：把 js 里 `onRequestConsent(field)` 改为读 `e.currentTarget.dataset.field`——实现时统一为：

```js
  async onRequestConsent(e) {
    const field = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.field) || (typeof e === 'string' ? e : '');
    if (!field) return;
    ...同上（field 局部变量）...
  },
```

onLike 匹配弹窗里 `that.onRequestConsent('contact')` 以字符串调用，两形态兼容。）

(3) 按钮组的「心动」加 loading：

```xml
      <t-button class="detail__btn" theme="primary" loading="{{interacting}}" bind:tap="onLike">心动</t-button>
```

（无感按钮同样加 `loading="{{interacting}}"`。）

- [ ] **Step 3: wxss 追加**

`profile-detail.wxss` 末尾追加：

```css
.detail__consent-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 32rpx;
  background: #ffffff;
  border-radius: var(--radius-card, 16rpx);
  margin-top: 2rpx;
}
.detail__consent-label {
  font-size: 26rpx;
}
```

- [ ] **Step 4: 类型检查 + 全量回归 + 提交**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 全绿（页面无单测，与既有页面同策略，T12 e2e 覆盖）

```bash
git add miniprogram/pages/profile-detail
git commit -m "feat(page): profile-detail 激活心动互配/无感/隐私申请/联系方式复制 + 错误区分与登录强刷"
```

---

### Task 10: report 举报页 + detail 举报入口接通

**Files:**
- Create: `miniprogram/pages/report/report.js`、`.wxml`、`.wxss`、`.json`
- Modify: `miniprogram/app.json`（pages 追加一行）

**Interfaces:**
- Consumes: T8 `report` 云函数与 `options.js REPORT_TYPES`；`utils/upload.js` 的 `uploadImage(prefix, filePath)` → fileID|null；T9 的 `onReport` 跳转 URL `?id=`
- Produces: 页面 `pages/report/report?id=<profileId>`（T12 e2e 直驱 `onSubmit`）

- [ ] **Step 1: 注册页面**

`miniprogram/app.json` pages 数组 `"pages/profile-detail/profile-detail"` 之后追加：

```json
    "pages/report/report"
```

- [ ] **Step 2: 四件套**

`miniprogram/pages/report/report.json`：

```json
{
  "navigationBarTitleText": "举报",
  "usingComponents": {
    "t-cell": "tdesign-miniprogram/cell/cell",
    "t-check-tag": "tdesign-miniprogram/check-tag/check-tag",
    "t-button": "tdesign-miniprogram/button/button",
    "t-empty": "tdesign-miniprogram/empty/empty"
  }
}
```

`miniprogram/pages/report/report.js`：

```js
// pages/report/report.js —— 举报表单（类型 + 描述 + 可选截图 ≤3，提交至 report 云函数）
const { callFunction } = require('../../utils/request.js');
const { REPORT_TYPES } = require('../../utils/options.js');
const { uploadImage } = require('../../utils/upload.js');

const SHOTS_MAX = 3;

Page({
  data: {
    targetId: '',
    types: REPORT_TYPES.map((t) => ({ text: t, on: false })),
    selectedType: '',
    description: '',
    shots: [],          // [{ local, fileID, uploading }]
    submitting: false,
    submitted: false,
  },

  onLoad(options) {
    this.setData({ targetId: (options && options.id) || '' });
  },

  onToggleType(e) {
    const { item } = e.currentTarget.dataset; // 单选：仅保留一项
    this.setData({
      selectedType: item,
      types: this.data.types.map((t) => ({ text: t.text, on: t.text === item })),
    });
  },

  onInputDesc(e) {
    this.setData({ description: e.detail.value });
  },

  // 选图并直传云存储（失败槽位剔除并 toast）
  async onAddShot() {
    if (this.data.shots.length >= SHOTS_MAX) {
      wx.showToast({ title: '最多 3 张截图', icon: 'none' });
      return;
    }
    const that = this;
    wx.chooseMedia({
      count: SHOTS_MAX - this.data.shots.length,
      mediaType: ['image'],
      success: (res) => {
        res.tempFiles.forEach((f) => that.uploadShot(f.tempFilePath));
      },
      fail: () => {},
    });
  },

  async uploadShot(local) {
    const idx = this.data.shots.length;
    this.setData({ shots: this.data.shots.concat({ local, fileID: '', uploading: true }) });
    const fileID = await uploadImage('reports', local);
    const shots = this.data.shots.slice();
    if (!fileID) {
      shots.splice(idx, 1);
      wx.showToast({ title: '截图上传失败', icon: 'none' });
    } else {
      shots[idx] = { local, fileID, uploading: false };
    }
    this.setData({ shots });
  },

  onRemoveShot(e) {
    const { index } = e.currentTarget.dataset;
    const shots = this.data.shots.slice();
    shots.splice(Number(index), 1);
    this.setData({ shots });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.data.selectedType) {
      wx.showToast({ title: '请选择举报类型', icon: 'none' });
      return;
    }
    const desc = this.data.description.trim();
    if (!desc) {
      wx.showToast({ title: '请填写举报描述', icon: 'none' });
      return;
    }
    if (this.data.shots.some((s) => s.uploading)) {
      wx.showToast({ title: '截图上传中，请稍候', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    const res = await callFunction('report', {
      targetId: this.data.targetId,
      type: this.data.selectedType,
      description: desc,
      screenshotFileIDs: this.data.shots.map((s) => s.fileID),
    });
    this.setData({ submitting: false });
    if (!res || res.error) {
      wx.showToast({ title: '提交失败，请稍后再试', icon: 'none' });
      return;
    }
    this.setData({ submitted: true });
  },
});
```

`miniprogram/pages/report/report.wxml`：

```xml
<view class="container report">
  <t-empty wx:if="{{submitted}}" description="举报已提交，我们会尽快处理">
    <t-button slot="action" theme="primary" size="large" bind:tap="wx.navigateBack">返回</t-button>
  </t-empty>

  <block wx:else>
    <view class="card report__card">
      <view class="report__title">举报类型</view>
      <view class="report__types">
        <t-check-tag
          wx:for="{{types}}"
          wx:key="text"
          content="{{item.text}}"
          checked="{{item.on}}"
          data-item="{{item.text}}"
          bind:change="onToggleType"
        />
      </view>
    </view>

    <view class="card report__card">
      <view class="report__title">举报描述</view>
      <textarea class="report__textarea" value="{{description}}" maxlength="200"
                placeholder="补充说明（必填，200 字内）" bindinput="onInputDesc" />
    </view>

    <view class="card report__card">
      <view class="report__title">截图（可选，最多 3 张）</view>
      <view class="report__shots">
        <image wx:for="{{shots}}" wx:key="local" class="report__shot" src="{{item.local}}"
               mode="aspectFill" data-index="{{index}}" bindlongpress="onRemoveShot" />
        <view class="report__shot report__shot--add" bindtap="onAddShot">＋</view>
      </view>
      <view class="text-secondary report__hint">长按已上传截图可移除</view>
    </view>

    <t-button class="report__submit" theme="primary" block loading="{{submitting}}" disabled="{{submitting}}" bind:tap="onSubmit">提交举报</t-button>
  </block>
</view>
```

`miniprogram/pages/report/report.wxss`：

```css
.report__card {
  margin-bottom: 20rpx;
}
.report__title {
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.report__types {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.report__textarea {
  width: 100%;
  min-height: 160rpx;
  font-size: 26rpx;
}
.report__shots {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.report__shot {
  width: 160rpx;
  height: 160rpx;
  border-radius: 12rpx;
  background: #f5f5f5;
}
.report__shot--add {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  color: var(--color-text-secondary, #999999);
  border: 1rpx dashed #dddddd;
  box-sizing: border-box;
}
.report__hint {
  font-size: 22rpx;
  margin-top: 12rpx;
}
.report__submit {
  margin-top: 12rpx;
}
```

- [ ] **Step 3: 类型检查 + 回归 + 提交**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 全绿

```bash
git add miniprogram/pages/report miniprogram/app.json
git commit -m "feat(page): report 举报表单页（类型/描述/截图直传云存储）接通详情页入口"
```

---

### Task 11: message 页真通知流 + interaction-list 页 + tabBar 未读角标

**Files:**
- Modify: `miniprogram/pages/message/message.js`（重写）、`.wxml`（重写）、`.json`（追加组件）、`.wxss`（追加）
- Create: `miniprogram/pages/interaction-list/interaction-list.js`、`.wxml`、`.wxss`、`.json`
- Modify: `miniprogram/app.json`（pages 追加一行）

**Interfaces:**
- Consumes: T7 `getNotifications`（`{ list, unread }`）/ `markRead`；T4 `respondConsent`（`{ consentId, action }`）；T6 `getInteractions`（`{ type, list }`）；通知 payload 快照形状
- Produces: message 页 data 键 `entries/unread/loading`；`interaction-list` 页路由 `pages/interaction-list/interaction-list?type=view|like`；tabBar 消息 tab 未读角标（index 1）

- [ ] **Step 1: 注册页面**

`miniprogram/app.json` pages 追加：

```json
    "pages/interaction-list/interaction-list"
```

- [ ] **Step 2: 重写 message 页**

`miniprogram/pages/message/message.json` 整体替换：

```json
{
  "navigationBarTitleText": "消息",
  "enablePullDownRefresh": true,
  "usingComponents": {
    "t-avatar": "tdesign-miniprogram/avatar/avatar",
    "t-badge": "tdesign-miniprogram/badge/badge",
    "t-empty": "tdesign-miniprogram/empty/empty",
    "t-cell": "tdesign-miniprogram/cell/cell",
    "t-button": "tdesign-miniprogram/button/button"
  }
}
```

`miniprogram/pages/message/message.js` 整体替换：

```js
// pages/message/message.js —— 【消息】tab：系统通知流（心动/被查看/匹配/授权请求与结果）
// 未读红点 + 点击已读 + tabBar 角标；consent_request 行内同意/拒绝；顶部入口进谁看过我/喜欢我的。
const { callFunction } = require('../../utils/request.js');

// 通知类型 → 展示文案（payload 为写入时快照；name 兜底嘉宾编号）
function entryText(n) {
  const name = (n.payload && (n.payload.nickname || n.payload.guestNo)) || '一位嘉宾';
  switch (n.type) {
    case 'like': return name + ' 对你心动了';
    case 'view': return name + ' 查看了你的资料';
    case 'match': return '与 ' + name + ' 匹配成功！可申请查看联系方式';
    case 'consent_request': return name + ' 申请查看你的' + (n.payload.field === 'asset' ? '资产信息' : '联系方式');
    case 'consent_result': {
      const field = n.payload.field === 'asset' ? '资产信息' : '联系方式';
      const map = { approved: '已同意，对方现在可查看', rejected: '已拒绝', revoked: '已撤销' };
      return '你的' + field + '申请：' + (map[n.payload.status] || '已更新');
    }
    default: return '收到一条新消息';
  }
}

Page({
  data: {
    entries: [], // [{ _id, type, payload, read, createdAt, text }]
    unread: 0,
    loading: false,
  },

  onShow() {
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  async loadList() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    const res = await callFunction('getNotifications');
    this.setData({ loading: false });
    if (!res || res.error) return; // 失败静默，保留下次 onShow 重试
    this.setData({
      entries: (res.list || []).map((n) => Object.assign({}, n, { text: entryText(n) })),
      unread: res.unread || 0,
    });
    this.syncBadge(res.unread || 0);
  },

  // tabBar 消息 tab（index 1）未读角标
  syncBadge(unread) {
    if (unread > 0) {
      wx.setTabBarBadge({ index: 1, text: String(Math.min(unread, 99)), fail: () => {} });
    } else {
      wx.removeTabBarBadge({ index: 1, fail: () => {} });
    }
  },

  // 点击行：已读 + 按类型跳转（心动/匹配/授权 → 对方详情）
  async onTapEntry(e) {
    const { id, profileId, read } = e.currentTarget.dataset;
    if (!read) {
      await callFunction('markRead', { ids: [id] });
      this.setData({
        unread: Math.max(0, this.data.unread - 1),
        entries: this.data.entries.map((n) => (n._id === id ? Object.assign({}, n, { read: true }) : n)),
      });
      this.syncBadge(Math.max(0, this.data.unread - 1));
    }
    if (profileId && profileId !== 'null') {
      wx.navigateTo({ url: '/pages/profile-detail/profile-detail?id=' + profileId, fail: () => {} });
    }
  },

  // consent_request 行内处理：approve / reject
  async onRespond(e) {
    const { consentId, action } = e.currentTarget.dataset;
    const res = await callFunction('respondConsent', { consentId, action });
    if (!res || res.error) {
      wx.showToast({ title: '操作失败，请稍后再试', icon: 'none' });
      return;
    }
    wx.showToast({ title: action === 'approve' ? '已同意' : '已拒绝', icon: 'none' });
    this.loadList();
  },

  onOpenInteractions(e) {
    const { type } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/interaction-list/interaction-list?type=' + type });
  },
});
```

`miniprogram/pages/message/message.wxml` 整体替换：

```xml
<view class="container message">
  <view class="card message__entries">
    <t-cell title="谁看过我" arrow hover bind:tap="onOpenInteractions" data-type="view" />
    <t-cell title="喜欢我的" arrow hover bind:tap="onOpenInteractions" data-type="like" />
  </view>

  <view class="message__list">
    <view
      wx:for="{{entries}}"
      wx:key="_id"
      class="message__item card {{item.read ? '' : 'message__item--unread'}}"
      data-id="{{item._id}}"
      data-profile-id="{{item.payload.profileId}}"
      data-read="{{item.read}}"
      bindtap="onTapEntry"
    >
      <t-avatar class="message__avatar" shape="circle" size="88rpx" /><!-- 通知 payload 无头像快照，用默认占位 -->
      <view class="message__body">
        <view class="message__text">{{item.text}}</view>
        <view class="message__time text-secondary">{{item.createdAt}}</view>
      </view>
      <t-badge wx:if="{{!item.read}}" class="message__badge-host" dot />
      <view wx:if="{{item.type === 'consent_request' && !item.read}}" class="message__actions" catchtap="() => {}">
        <t-button size="extra-small" variant="outline" data-consent-id="{{item.payload.consentId}}"
                  data-action="approve" catchtap="onRespond">同意</t-button>
        <t-button size="extra-small" variant="outline" data-consent-id="{{item.payload.consentId}}"
                  data-action="reject" catchtap="onRespond">拒绝</t-button>
      </view>
    </view>
  </view>

  <t-empty wx:if="{{!loading && !entries.length}}" class="message__empty" description="还没有消息，去遇见看看吧" />
</view>
```

（注：`catchtap="() => {}"` 不合法——actions 容器阻止冒泡改为给两个按钮 `catchtap="onRespond"`、容器不绑事件；若按钮 tap 仍冒泡到行，用 `mut-bind:tap` 或把 actions 放行外。实现时按小程序实际行为采用：按钮 `catchtap="onRespond"` 即可阻断，容器无需绑定。上模版以最终实现为准——执行者以「点按钮不触发行跳转」为验收。）

`miniprogram/pages/message/message.wxss` 追加：

```css
.message__entries {
  margin-bottom: 20rpx;
}
.message__item--unread {
  border: 1rpx solid rgba(255, 90, 95, 0.35);
}
.message__text {
  font-size: 28rpx;
}
.message__time {
  font-size: 22rpx;
  margin-top: 8rpx;
}
.message__actions {
  display: flex;
  gap: 12rpx;
}
```

- [ ] **Step 3: interaction-list 页四件套**

`miniprogram/pages/interaction-list/interaction-list.json`：

```json
{
  "navigationBarTitleText": "谁看过我",
  "usingComponents": {
    "t-avatar": "tdesign-miniprogram/avatar/avatar",
    "t-empty": "tdesign-miniprogram/empty/empty",
    "t-tag": "tdesign-miniprogram/tag/tag"
  }
}
```

`miniprogram/pages/interaction-list/interaction-list.js`：

```js
// pages/interaction-list/interaction-list.js —— 谁看过我（type=view）/ 喜欢我的（type=like）
const { callFunction } = require('../../utils/request.js');

Page({
  data: {
    type: 'view',
    title: '谁看过我',
    list: [],
    loading: false,
  },

  onLoad(options) {
    const type = (options && options.type) === 'like' ? 'like' : 'view';
    wx.setNavigationBarTitle({ title: type === 'like' ? '喜欢我的' : '谁看过我' });
    this.setData({ type, title: type === 'like' ? '喜欢我的' : '谁看过我' });
    this.loadList(type);
  },

  async loadList(type) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    const res = await callFunction('getInteractions', { type });
    this.setData({ loading: false });
    if (!res || res.error) {
      wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' });
      return;
    }
    this.setData({ list: res.list || [] });
  },

  onTapItem(e) {
    const { id } = e.currentTarget.dataset;
    if (id) wx.navigateTo({ url: '/pages/profile-detail/profile-detail?id=' + id, fail: () => {} });
  },
});
```

`miniprogram/pages/interaction-list/interaction-list.wxml`：

```xml
<view class="container ilist">
  <view class="message__list">
    <view
      wx:for="{{list}}"
      wx:key="profileId"
      class="message__item card"
      data-id="{{item.profileId}}"
      bindtap="onTapItem"
    >
      <t-avatar class="message__avatar" image="{{item.avatarFileID}}" shape="circle" size="88rpx" />
      <view class="message__body">
        <view class="message__name">
          {{item.nickname || item.guestNo}}
          <text class="text-secondary ilist__no">{{item.guestNo}}</text>
          <text wx:if="{{item.verified}}" class="ilist__verified text-primary">· 已实名</text>
        </view>
        <view class="text-secondary ilist__sub">
          {{type === 'like' && item.matched ? '互相心动，已匹配' : (type === 'like' ? '对你心动了' : '查看了你的资料')}}
        </view>
      </view>
      <t-tag wx:if="{{type === 'like' && item.matched}}" theme="primary" variant="light" size="small">已匹配</t-tag>
    </view>
  </view>
  <t-empty wx:if="{{!loading && !list.length}}" class="message__empty"
           description="{{type === 'like' ? '还没有人心动你，再等等' : '还没有人查看过你，完善资料更受关注'}}" />
</view>
```

`miniprogram/pages/interaction-list/interaction-list.wxss`：

```css
.ilist__no {
  font-size: 22rpx;
  margin-left: 12rpx;
}
.ilist__verified {
  font-size: 22rpx;
  margin-left: 8rpx;
}
.ilist__sub {
  font-size: 24rpx;
  margin-top: 8rpx;
}
```

（该页复用 message 页的 `.message__list/.message__item/.message__avatar/.message__body/.message__name` 类——这些是页面级样式，跨页不共享。执行时把所需类复制进本页 wxss：`message__list/message__item/message__avatar/message__body/message__name/message__empty`，直接从 message.wxss 拷贝并保持类名不变，注释「与 message 页同构」。）

- [ ] **Step 4: 类型检查 + 回归 + 提交**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 全绿

```bash
git add miniprogram/pages/message miniprogram/pages/interaction-list miniprogram/app.json
git commit -m "feat(page): 消息 tab 真通知流（未读角标/授权行内处理）+ 谁看过我/喜欢我的列表页"
```

---

### Task 12: P3 E2E + P2 遗留 e2e 增强 + 文档 + 全量回归

**Files:**
- Create: `tests/e2e/p3-interact.test.ts`
- Modify: `tests/e2e/p2-meet.test.ts`（2 处增强）
- Modify: `README.md`（追加 P3 部署与验收节）
- Modify: `docs/superpowers/specs/2026-08-15-just4love-phased-roadmap-design.md`（状态行 + §6.7 勾稽标注）

**Interfaces:**
- Consumes: T1-T11 全部产出；`e2e-test` skill 通道规则；p1/p2 的 file-local helper 约定（wait/waitFor/callCloud 复制沿用）
- Produces: P3 验收证据 + 部署文档

**前置条件（执行前请用户在 IDE 完成）：对 `getProfileDetail`、`listProfiles`、`setupDb`、`interact`、`getInteractions`、`requestConsent`、`respondConsent`、`getNotifications`、`markRead`、`report` 逐个右键「上传并部署：云端安装依赖」（CLI deploy 不可用）；部署后调用一次 `setupDb`（幂等建 5 个新集合——E2E beforeAll 会自动调）。**

**E2E 可达性限制（如实声明，写入文件头注释）**：单 DevTools 单测试号（单 openid）无法构造「对方」视角——互配、被通知、owner 同意授权三条链路的**双向闭环**由集成测试（mock 任意 openid）全覆盖；E2E 覆盖本端可达路径：interact 落库/返回、授权申请幂等与 forbidden、通知列表渲染与角标数据、举报提交全链路、P2 遗留断言增强。

- [ ] **Step 1: 写 E2E**

新建 `tests/e2e/p3-interact.test.ts`：

```ts
/**
 * P3 互动与隐私授权 E2E —— 真实云函数（App 级通道，遵守 e2e-test skill）
 * 单测试号无法构造对方视角：互配/被通知/owner 同意由集成测试覆盖；
 * 本文件覆盖本端可达路径：interact 落库、授权申请幂等、通知流渲染、举报全链路。
 * helper 与 p1/p2 文件同款（file-local 约定，保持各文件自包含可独跑）。
 */
import {
  connectOrLaunch, closeSession, pageData, runInApp, navTo,
  TEST_TIMEOUT as T, MiniProgram, ConnectedSession,
} from './helpers';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn: () => Promise<boolean>, timeout = 15000, step = 500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await wait(step);
  }
  throw new Error('waitFor 超时');
}

function callCloud(mp: MiniProgram, name: string, data?: Record<string, unknown>): Promise<any> {
  return mp.evaluate(
    (n: string, d: Record<string, unknown> | undefined) =>
      new Promise((resolve) => {
        wx.cloud
          .callFunction({ name: n, data: d || {} })
          .then((r) => resolve(r.result))
          .catch((e) => resolve({ error: String((e && e.errMsg) || e) }));
      }),
    name,
    data
  );
}

describe('P3 互动与隐私授权 E2E（真实云函数）', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;
  let myProfileId = '';
  let targetProfileId = ''; // 环境中任一非本人嘉宾（无则用本人 id 测 forbidden/cannot-self 路径）

  beforeAll(async () => {
    session = await connectOrLaunch();
    mp = session.miniProgram;
    const setup = await callCloud(mp, 'setupDb', {});
    if (setup && setup.error) throw new Error('setupDb failed: ' + JSON.stringify(setup));
    const login = await callCloud(mp, 'login', {});
    expect(login && login.user).toBeTruthy();
    let mine: any = await callCloud(mp, 'getMyProfile', {});
    if (!mine || !mine.profile) {
      await callCloud(mp, 'updateProfile', {
        patch: { basic: { nickname: 'E2E嘉宾', gender: '女', birthday: '1995-06-15' } },
      });
      mine = await callCloud(mp, 'getMyProfile', {});
    }
    myProfileId = mine.profile._id;
    const list = await callCloud(mp, 'listProfiles', { filter: {}, page: 1, pageSize: 10 });
    const other = (list.list || []).find((it: any) => it._id !== myProfileId);
    targetProfileId = other ? other._id : myProfileId; // 无他人时走 cannot-self 分支断言
  }, 120000);

  afterAll(() => closeSession(session));

  it('interact：对自己 → cannot interact self；对他人心动 → 落库返回 matched=false', async () => {
    const self = await callCloud(mp, 'interact', { targetProfileId: myProfileId, type: 'like' });
    if (targetProfileId === myProfileId) {
      expect(self.error).toBe('cannot interact self'); // 环境无他人嘉宾：至少验证守卫
      return;
    }
    expect(self.error).toBeUndefined();
    const res = await callCloud(mp, 'interact', { targetProfileId, type: 'like' });
    expect(res.matched).toBe(false); // 单向（对方是真实他人账号，未回心）
  }, T);

  it('授权申请：对自己 → cannot request self；重复申请幂等（unchanged）', async () => {
    const selfReq = await callCloud(mp, 'requestConsent', { ownerProfileId: myProfileId, field: 'contact' });
    expect(selfReq.error).toBe('cannot request self');
    if (targetProfileId === myProfileId) return;
    const first = await callCloud(mp, 'requestConsent', { ownerProfileId: targetProfileId, field: 'contact' });
    expect(['pending', 'approved']).toContain(first.status);
    const second = await callCloud(mp, 'requestConsent', { ownerProfileId: targetProfileId, field: 'contact' });
    expect(second.unchanged).toBe(true); // 幂等
  }, T);

  it('respondConsent：非 owner 处理他人授权 → forbidden', async () => {
    // 找一条「我作为 owner」的授权不存在；直接构造：对我自己的授权申请被 cannot self 挡，
    // 故用假 consentId 验证 not found，行为已由集成测试覆盖 forbidden——此处验证错误路径不崩
    const res = await callCloud(mp, 'respondConsent', { consentId: 'nonexistent', action: 'approve' });
    expect(res.error).toBe('not found');
  }, T);

  it('消息页：通知列表渲染 + 未读数据 + 顶部入口在位', async () => {
    await navTo(mp, '/pages/message/message');
    await waitFor(async () => (await pageData<boolean>(mp, 'loading')) === false);
    const d = await pageData<any>(mp);
    expect(Array.isArray(d.entries)).toBe(true);
    expect(typeof d.unread).toBe('number');
    // 顶部两个入口（t-cell 跨界选择器）
    const cells = await mp.evaluate(
      () => new Promise<number>((resolve) => {
        wx.createSelectorQuery().selectAll('.message__entries >>> .t-cell').fields({ id: true }).exec((res: any) => {
          resolve((res[0] || []).length);
        });
      })
    );
    expect(cells).toBe(2);
  }, T);

  it('举报全链路：report 页校验 + 提交成功态', async () => {
    await navTo(mp, '/pages/report/report?id=' + targetProfileId);
    await waitForDataExists(mp, 'types');
    // 未选类型提交 → toast 路径（不中断），驱动后仍 submitted=false
    await drivePage(mp, 'onSubmit', {});
    const mid = await pageData<any>(mp);
    expect(mid.submitted).toBe(false);
    // 选择类型 + 填描述 → 提交成功
    await drivePage(mp, 'onToggleType', { currentTarget: { dataset: { item: '虚假资料' } } });
    await drivePage(mp, 'onInputDesc', { detail: { value: 'E2E 自动化举报' } });
    await drivePage(mp, 'onSubmit', {});
    await waitFor(async () => (await pageData<boolean>(mp, 'submitted')) === true);
  }, T);

  it('P2 遗留：详情页错误区分（loadError 独立于 notFound）数据键在位', async () => {
    await navTo(mp, '/pages/profile-detail/profile-detail?id=' + targetProfileId);
    await waitFor(async () => (await pageData<any>(mp, 'profile')) !== null);
    const d = await pageData<any>(mp);
    expect(d.consents).toBeTruthy(); // T5 响应键
    expect(typeof d.consents.contact).toBe('string');
    expect(d.loadError).toBe(false);
  }, T);

  /** 等待页面 data[path] 非 null/undefined */
  async function waitForDataExists(m: MiniProgram, path: string, timeout = 15000): Promise<void> {
    await waitFor(async () => {
      const v = await pageData<unknown>(m, path);
      return v !== null && v !== undefined;
    }, timeout);
  }

  function drivePage(m: MiniProgram, method: string, event: Record<string, unknown>): Promise<boolean> {
    return m.evaluate(
      (mm: string, ev: Record<string, unknown>) => {
        getCurrentPages().slice(-1)[0][mm](ev);
        return true;
      },
      method,
      event
    );
  }
});
```

（注意：`waitForDataExists`/`drivePage` 为文件内函数，须在 `it` 执行前已定义——放 describe 体内如上（函数声明提升不适用于箭头函数赋值，故以方法声明 `async function` 形式提升可用）。）

- [ ] **Step 2: p2-meet 断言增强（P2 终审遗留）**

(1) it1 末尾（`for (const item of list) {...}` 循环之后）追加：

```ts
    expect(await pageData<boolean>(mp, 'loadError')).toBe(false);
```

(2) it3 的兜底建档 patch 增加隐私具体值，privacy 断言改具体字段。将：

```ts
      await callCloud(mp, 'updateProfile', {
        patch: { basic: { nickname: 'E2E嘉宾', gender: '女', birthday: '1995-06-15' } },
      });
```

改为：

```ts
      await callCloud(mp, 'updateProfile', {
        patch: {
          basic: { nickname: 'E2E嘉宾', gender: '女', birthday: '1995-06-15' },
          privacy: { contact: { phone: '13800000000', wechat: 'e2e-wx' } },
        },
      });
```

（若资料已存在则兜底不触发——断言改为双分支：`expect(d.profile.privacy).toBeTruthy(); if (d.profile.privacy.contact) { expect(typeof d.profile.privacy.contact.phone).toBe('string'); }`，保持对既有 dogfood 资料的兼容。）

- [ ] **Step 3: 类型检查 + 全量 E2E**

Run: `npx tsc --noEmit -p tsconfig.json && npm run test:e2e`
Expected: 六个文件全过（app / message / p1-profile / p2-meet / p3-interact / tool-pages）。message.test.ts 若有 mock 会话断言过期则按实际失败信息同步更新（该文件断言 sessions mock——message 页已改通知流，**预期需更新**：将 sessions 断言改为 entries 结构性断言。执行时先跑，红则改，属预期内适配）。

- [ ] **Step 4: README 追加 P3 节**

`README.md`「## P2 部署与验收」节之后、「## TypeScript」之前插入：

```markdown
## P3 部署与验收（互动与隐私授权）

### 部署步骤

1. **云函数**（IDE 右键「上传并部署：云端安装依赖」）：改动 3 个——`getProfileDetail`、
   `listProfiles`、`setupDb`；新增 7 个——`interact`、`getInteractions`、`requestConsent`、
   `respondConsent`、`getNotifications`、`markRead`、`report`。
2. **初始化集合**：部署后调用一次 `setupDb`（幂等）——新增 `interactions`、`consents`、
   `notifications`、`reports`、`quota_counters` 五个集合。
3. **新集合权限**：云开发控制台设为「仅创建者可读写」。
4. **配额计数已原子化**：并发首看不再可能超额（quota_counters 计数器 + 回退）。

### 验收清单（对应设计文档 §6 与 §10）

- [ ] 详情页心动/无感可用；互相心动双方收到匹配通知并引导申请联系方式
- [ ] 无感后该嘉宾不再出现在遇见列表（翻页不串页）
- [ ] 谁看过我/喜欢我的两个列表可用（去重、matched 标记）
- [ ] 消息 tab 为真实通知流：未读红点 + tabBar 角标、点击已读、授权请求行内同意/拒绝
- [ ] 隐私授权全链路：申请 → 对方同意 → 详情页解锁对应字段 → 撤销后重新隐藏；拒绝/撤销后可重新申请
- [ ] 聊天按钮：联系方式解锁后展示并可复制微信号/手机号（导流微信，不自建 IM）
- [ ] 举报表单可提交（类型/描述/截图 ≤3），落 `reports` 待 P4 处理
- [ ] 未完善资料无法被直链/分享查看（basicInit 防御）
- [ ] 详情页加载失败与嘉宾不存在分开展示（可重试）
- [ ] `npm test` 与 `npm run test:e2e` 全部通过
```

- [ ] **Step 5: roadmap 更新**

状态行改为：

```markdown
- **状态**：P1/P2 已完成并验收；P3 已完成（实现计划见 `plans/2026-08-20-just4love-p3-interaction-consent.md`）；P4 待启动
```

§6.7 各条目末尾追加落地标注：配额原子化/basicInit 防御/错误区分/onLoginRetry 强刷/e2e 断言增强/min>max 钳制 → `✅ 已落地（P3 T1/T3/T9/T12）`；filter-panel 样式隔离 → `✅ 已落地（2026-08-19 TDesign 化）`；mock-db 保真度与 createdAt 回填 → `留 P5`。

- [ ] **Step 6: 全量回归 + 提交**

Run: `npx tsc --noEmit -p tsconfig.json && npm test && npm run test:e2e`
Expected: 三层全绿。

```bash
git add tests/e2e/p3-interact.test.ts tests/e2e/p2-meet.test.ts tests/e2e/message.test.ts README.md docs/superpowers/specs/2026-08-15-just4love-phased-roadmap-design.md
git commit -m "test(e2e): P3 互动/授权/举报全链路 + P2 遗留断言增强 + 部署验收文档"
```

（message.test.ts 仅在实际适配后入提交；未改动则从 git add 中去掉。）

---

## 自审记录（写计划时已核）

1. **Spec 覆盖**：§6.1 心动/无感/互配/列表排除 → T2+T3；§6.2 谁看过我/喜欢我的 → T6+T11；§6.3 通知流+未读+已读+匹配引导授权 → T1(被查看通知)+T7+T11+T9(匹配弹窗)；§6.4 授权流申请/同意/拒绝/撤销/解锁 → T4+T5+T9；§6.5 分享落地（P2 已做，T12 e2e 顺带验证）+ 举报 → T8+T10；§6.6 云函数 → T2/T4/T6/T7/T8 全部七个 + 既有三个改造；§6.7 遗留 → 配额原子化 T1、basicInit T1、错误区分 T9、onLoginRetry T9、e2e 增强 T12、min>max T3、样式隔离已落地、其余标注留 P5。**有意偏差**：互配/被通知/owner 同意的双向闭环由集成测试覆盖（单测试号无法构造对方），E2E 覆盖本端可达路径并如实声明。
2. **占位符扫描**：无 TBD；T10/T11 wxml 给全文；message.wxml 的 catchtap 说明已给出实现裁定（按钮 catchtap 即可阻断，以「点按钮不触发行跳转」为验收）；interaction-list 复用 message 类名处已注明「复制进本页 wxss」。
3. **一致性**：notifications payload 形状在 T1/T2/T4 三处写入方一致（nickname/guestNo/profileId，consent_* 另带 field/consentId/status）；`notify`/`getDb`/`profileSnapshot` 镜像注释齐；consents 状态机（pending→approved/rejected；approved→revoked；rejected/revoked→pending 重新申请）在 T4 定义、T5 响应、T9 渲染、T11 文案四处一致；T9 `onRequestConsent` 兼容 dataset 与字符串两形态（onLike 匹配弹窗回调）；T12 e2e 的 drivePage/waitFor 与 p1/p2 同款；T3 fetchLimit 公式与 mock-db 无 nin 现状匹配；T6 的 `at` 字段 view 取 createdAt、like 取 updatedAt 与排序键一致。
4. **风险**：① 9 个云函数部署是 E2E 前置（T12 头部已列清单）；② message.test.ts 存量 mock 断言必过期（T12 Step 3 已声明适配策略）；③ 通知 createdAt 直出 ISO 字符串（未格式化相对时间）——展示从简，P4 打磨；④ interactions/consents 无唯一索引，并发同 pair 双建窗口极小（单用户操作），集成测试覆盖串行路径；P4 索引治理时统一处理（roadmap §6.7 既有条目）。

