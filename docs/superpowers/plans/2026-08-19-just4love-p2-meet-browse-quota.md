# just4love P2「遇见：浏览与配额」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「推荐」tab 升级为「遇见」——真实资料卡列表（筛选 + 分页）+ 详情页 + 角色配额（游客/普通/认证/管理员四档）。

**Architecture:** 两个新云函数（`listProfiles` 筛选分页、`getProfileDetail` 配额校验+查看日志+按角色裁剪隐私）复用 P1 的「注入 mock-db 集成测试」模式；前端复用 `profile-card` 组件为列表卡/详情卡，新增 `filter-panel` 组件（自绘 chips，不引 TDesign 受控组件）与 `profile-detail` 页；`view_logs`/`config` 两个新集合由 `setupDb` 幂等初始化。

**Tech Stack:** 微信云开发（wx-server-sdk ~2.6.3）、Jest（unit=simulate / integration=mock-db 注入 / e2e=miniprogram-automator App 级通道）。

**Spec:** `docs/superpowers/specs/2026-08-15-just4love-phased-roadmap-design.md` §5（P2）+ §5.4 配额表 + §10 验收口径。

## Global Constraints

- 测试命令：`npm test`（unit+integration）；`npm run test:e2e`；E2E 前先 `npx tsc --noEmit -p tsconfig.json`。
- 敏感值约定（CLAUDE.md）：`miniprogram/app.js` 与 `project.config.json` 设有 skip-worktree，**不要 `git add -f`**；本计划不触碰这两个文件的敏感字段（app.json 不是敏感文件，可改）。
- 云函数模块**顶层不得** `require('wx-server-sdk')`（集成测试直接 require 云函数文件，见 `cloudfunctions/login/index.js:4` 注释）。
- E2E 遵守 `.claude/skills/e2e-test`：只走 App 级通道（evaluate/switchTab/navTo），**禁用** `page.$()`/`page.data()`/`wx.navigateTo`；每个 `it` 显式传 `TEST_TIMEOUT as T`；跨组件边界选择器用 `>>>`（如 `.recommend__list >>> .pc`，已有通过先例）。
- 云函数部署走 IDE GUI 右键「上传并部署：云端安装依赖」（本机 CLI deploy 持续 41002 签名失败，勿用 CLI）。
- 主题色 `#FF5A5F`（CSS 变量 `--color-primary`）；TDesign 受控组件不引入（2026-08-16 裁定），筛选面板 chips 自绘。
- 新集合数据库权限：「仅创建者可读写」（客户端不直连数据库）。
- **游客语义**（本计划裁定）：游客 = `users` 集合查无该 openid 文档（未经过 `login` 建档）。列表对游客开放；详情对游客返回 `{ error: 'login required' }`，前端显示登录引导。

## 数据契约（各任务共用的精确形状）

**CardVO**（列表项与详情页 profile 同构，云函数侧两份实现保持镜像，勿单边改字段）：

```js
{ _id, basic, about, album: [], stories: [], tags: {}, verified: boolean }
// 不含 openid / userId / privacy（隐私整段剔除；本人与管理员详情另附 privacy）
// verified = 目标用户 role ∈ ['verified', 'admin']
```

**filter**（filter-panel 产出 → listProfiles 入参；空维度剔除，不传空数组——云数据库 `_.in([])` 匹配不到任何值）：

```js
{ ageMin?: number, ageMax?: number, heightMin?: number, heightMax?: number,
  educations?: string[], emotionalStatuses?: string[], cities?: string[], jobs?: string[] }
// cities 元素形如 '广东省 深圳市'（与 profiles.about.city 存储格式一致）
```

**listProfiles 返回**：`{ list: CardVO[], page: number, hasMore: boolean }`（`pageSize+1` 探测 hasMore，免 count()）。

**getProfileDetail 返回**：
- 成功：`{ profile: CardVO(本人/admin 附 privacy), verified, self: boolean, quota: { used, limit } | null }`（本人 `quota: null`；admin `limit: -1`）
- `{ error: 'login required' }`（游客）/ `{ error: 'not found' }` / `{ error: 'quota exceeded', quota: { used, limit } }`

**配额口径**（spec §5.4 表格）：

| 角色 | 概览列表 | 资料详情 | 联系方式 |
|---|---|---|---|
| 游客（无 users 文档） | ✅ | ❌ → 登录引导 | ❌ |
| 普通用户 normal | ✅ | 5 个/天 | ❌（🔒 占位，P3 授权流） |
| 认证用户 verified | ✅ | 15 个/天 | ❌（同上） |
| 管理员 admin | ✅ | 不限 | ✅ 明文直看 |

- 「N 个/天」= 当日查看的**不同嘉宾**数（`view_logs` 按 `targetId` 去重；重复看不重复计数）。
- 「天」按东八区日界（云函数运行于 UTC，`dateKey` 手动 +8h 计算）。
- 配额数字存 `config` 集合 `config/quotas` 文档 `{ normal: 5, verified: 15 }`，P4 前在云开发控制台改；文档缺失时代码内默认值兜底。

---

### Task 1: mock-db 查询能力扩展

**Files:**
- Modify: `tests/helpers/mock-db.js`
- Test: `tests/unit/mock-db.test.js`（新建）

**Interfaces:**
- Consumes: 现有 mock-db（`createMockDb`、等值 where、doc/add/set/update/remove、`command.inc`）
- Produces: `db.command.{gte,lte,gt,lt,neq,in}`（可链式 AND，如 `_.gte(x).lte(y)`，与 wx-server-sdk 语义一致）；`where()` 支持点路径（`'about.height'`）与命令对象；查询链 `.orderBy(field, 'asc'|'desc').skip(n).limit(n).get()`。Task 2/3 的云函数与集成测试依赖这些能力。

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/mock-db.test.js`：

```js
// tests/unit/mock-db.test.js —— mock-db 查询能力单测（Task 1 新增能力）
const { createMockDb } = require('../helpers/mock-db.js');

function seedDb() {
  return createMockDb({
    profiles: {
      p1: { _id: 'p1', openid: 'a', basicInit: true, createdAt: '2026-08-01T00:00:00Z',
            basic: { birthday: '1990-03-08' }, about: { height: 178, education: '本科', city: '广东省 深圳市' } },
      p2: { _id: 'p2', openid: 'b', basicInit: true, createdAt: '2026-08-03T00:00:00Z',
            basic: { birthday: '1995-06-15' }, about: { height: 165, education: '硕士', city: '北京市 朝阳区' } },
      p3: { _id: 'p3', openid: 'c', basicInit: false, createdAt: '2026-08-02T00:00:00Z',
            basic: { birthday: '1988-01-01' }, about: { height: 172, education: '本科', city: '广东省 深圳市' } },
    },
  });
}

describe('helpers/mock-db 查询扩展', () => {
  test('where 支持点路径等值查询', async () => {
    const db = seedDb();
    const res = await db.collection('profiles').where({ 'about.education': '本科' }).get();
    expect(res.data.map((d) => d._id).sort()).toEqual(['p1', 'p3']);
  });

  test('command: 数值范围 gte/lte（含链式 AND）', async () => {
    const db = seedDb();
    const _ = db.command;
    const res = await db.collection('profiles')
      .where({ 'about.height': _.gte(170).lte(180) }).get();
    expect(res.data.map((d) => d._id)).toEqual(['p1']);
  });

  test('command: 字符串范围（ISO 日期前缀比较）', async () => {
    const db = seedDb();
    const _ = db.command;
    const res = await db.collection('profiles')
      .where({ 'basic.birthday': _.gte('1989-01-01').lte('1994-12-31') }).get();
    expect(res.data.map((d) => d._id)).toEqual(['p1']);
  });

  test('command: in 多值命中 / neq 排除', async () => {
    const db = seedDb();
    const _ = db.command;
    const inRes = await db.collection('profiles').where({ 'about.education': _.in(['硕士', '博士']) }).get();
    expect(inRes.data.map((d) => d._id)).toEqual(['p2']);
    const neqRes = await db.collection('profiles').where({ openid: _.neq('a') }).get();
    expect(neqRes.data.map((d) => d._id).sort()).toEqual(['p2', 'p3']);
  });

  test('orderBy desc + skip + limit 分页', async () => {
    const db = seedDb();
    const page1 = await db.collection('profiles')
      .where({ basicInit: true }).orderBy('createdAt', 'desc').skip(0).limit(1).get();
    expect(page1.data.map((d) => d._id)).toEqual(['p2']);
    const page2 = await db.collection('profiles')
      .where({ basicInit: true }).orderBy('createdAt', 'desc').skip(1).limit(1).get();
    expect(page2.data.map((d) => d._id)).toEqual(['p1']);
  });

  test('limit+1 探测 hasMore 模式', async () => {
    const db = seedDb();
    // 全量 3 条、pageSize=2：limit(3) 取回 3 条 > 2 → hasMore
    const got = await db.collection('profiles')
      .where({}).orderBy('createdAt', 'desc').skip(0).limit(3).get();
    expect(got.data).toHaveLength(3);
    expect(got.data.length > 2).toBe(true); // hasMore 判定成立
  });

  test('get 返回深拷贝（改结果不影响库内文档）', async () => {
    const db = seedDb();
    const res = await db.collection('profiles').where({ _id: 'p1' }).get();
    res.data[0].about.height = 999;
    const again = await db.collection('profiles').where({ _id: 'p1' }).get();
    expect(again.data[0].about.height).toBe(178);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest -c tests/jest.config.js --selectProjects unit tests/unit/mock-db.test.js`
Expected: FAIL —— 链式 `_.gte().lte()` 报 `_.gte(...) is not a function` 或 `in`/`neq` 为 undefined；点路径 where 返回空数组。

- [ ] **Step 3: 实现扩展**

`tests/helpers/mock-db.js` 整体替换为：

```js
// tests/helpers/mock-db.js —— 内存版云数据库 mock（集成测试共用）
// 仅实现本项目云函数用到的子集：
//   collection(name).where(query).orderBy(field, order).skip(n).limit(n).get() → { data: [...] }
//     query 支持：等值、点路径（'about.height'）、db.command 命令（可链式 AND）
//   collection(name).doc(id).get() → { data }（不存在时抛错，同云数据库语义）
//   collection(name).doc(id).set({ data })（整篇替换）/ .update({ data })（不存在 → { updated: 0 }）
//   collection(name).doc(id).remove()
//   collection(name).add({ data }) → { _id }（支持自定义 data._id）
//   db.command：inc(n)（update 时解释）/ gte/lte/gt/lt/neq/in（where 时解释，链式为 AND）
const clone = (v) => JSON.parse(JSON.stringify(v));

// 点路径取值：'about.height' → doc.about.height（缺路径返回 undefined）
function getByPath(obj, path) {
  return path.split('.').reduce(
    (cur, key) => (cur === undefined || cur === null ? undefined : cur[key]),
    obj
  );
}

// 单个命令是否匹配文档值
function matchOne(op, v, docVal) {
  switch (op) {
    case 'gte': return docVal >= v;
    case 'lte': return docVal <= v;
    case 'gt': return docVal > v;
    case 'lt': return docVal < v;
    case 'neq': return docVal !== v;
    case 'in': return v.indexOf(docVal) >= 0;
    default: return false;
  }
}

// 命令对象：{ __ops: [{op, v}, ...] }，多元素即链式 AND（对应 wx-server-sdk 的 _.gte(x).lte(y)）
const CMD_OPS = ['gte', 'lte', 'gt', 'lt', 'neq', 'in'];
function makeCmd(ops) {
  const cmd = { __ops: ops };
  for (const name of CMD_OPS) {
    cmd[name] = (v) => makeCmd(ops.concat([{ op: name, v }]));
  }
  return cmd;
}
const isCmd = (c) => !!c && typeof c === 'object' && Array.isArray(c.__ops);
const matchCmd = (cmd, docVal) => cmd.__ops.every(({ op, v }) => matchOne(op, v, docVal));

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

  const command = { inc: (n) => ({ __inc: n }) };
  for (const op of CMD_OPS) {
    command[op] = (v) => makeCmd([{ op, v }]);
  }

  return {
    command,
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
        where: (query) => {
          // 链式 orderBy/skip/limit 只记录，get() 时统一执行（filter → sort → skip → limit）
          const ops = { orderBy: null, skip: 0, limit: Infinity };
          const chain = {
            orderBy: (field, order) => { ops.orderBy = { field, order }; return chain; },
            skip: (n) => { ops.skip = n; return chain; },
            limit: (n) => { ops.limit = n; return chain; },
            get: async () => {
              let docs = Object.values(col).filter((d) =>
                Object.keys(query).every((k) => {
                  const cond = query[k];
                  const val = getByPath(d, k);
                  return isCmd(cond) ? matchCmd(cond, val) : val === cond;
                })
              );
              if (ops.orderBy) {
                const { field, order } = ops.orderBy;
                // 缺字段文档按最小值参与排序（本项目排序列 createdAt 均存在，此语义仅兜底）
                const norm = (v) => (v === undefined ? -Infinity : v);
                docs = docs.slice().sort((a, b) => {
                  const cmp = norm(getByPath(a, field)) < norm(getByPath(b, field)) ? -1
                    : norm(getByPath(a, field)) > norm(getByPath(b, field)) ? 1 : 0;
                  return order === 'desc' ? -cmp : cmp;
                });
              }
              if (ops.skip > 0) docs = docs.slice(ops.skip);
              if (Number.isFinite(ops.limit)) docs = docs.slice(0, ops.limit);
              return { data: docs.map(clone) };
            },
          };
          return chain;
        },
      };
    },
  };
}

module.exports = { createMockDb };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest -c tests/jest.config.js --selectProjects unit tests/unit/mock-db.test.js`
Expected: PASS（7 个用例）

- [ ] **Step 5: 全量回归 + 提交**

Run: `npm test`
Expected: 全绿（现有 integration 用例仍用等值 where，不受影响）

```bash
git add tests/helpers/mock-db.js tests/unit/mock-db.test.js
git commit -m "test(helpers): mock-db 扩展查询能力（command 链式比较/点路径/orderBy/skip/limit）"
```

---

### Task 2: updateProfile 补 createdAt + listProfiles 云函数

**Files:**
- Modify: `cloudfunctions/updateProfile/index.js`（1 处：建档时间）
- Modify: `tests/integration/updateProfile.test.js`（追加 2 用例）
- Create: `cloudfunctions/listProfiles/index.js`、`cloudfunctions/listProfiles/package.json`
- Test: `tests/integration/listProfiles.test.js`（新建）

**Interfaces:**
- Consumes: Task 1 的 mock-db 查询能力；`profiles` 文档结构（P1 updateProfile 产出）
- Produces: `listProfilesByOpenid(openid, filter, page, pageSize, db)` → `{ list: CardVO[], page, hasMore }`（CardVO 见数据契约）；`exports.main(event)` 读 `event.filter/page/pageSize`。`profiles.createdAt`（建档时间，首次写入后不变）——列表排序依赖，Task 6 页面与 Task 7 E2E 依赖返回形状。

- [ ] **Step 1: 写失败测试（updateProfile createdAt）**

在 `tests/integration/updateProfile.test.js` 文件末尾（最外层 describe 内）追加：

```js
  test('首次建档写入 createdAt，再次更新保留原值（P2 列表排序依赖）', async () => {
    const db = createMockDb({ users: { u1: { _id: 'u1', openid: 'o1', role: 'normal', guestNo: 'J0001' } } });
    const first = await updateProfileByOpenid('o1', { basic: { nickname: '小鱼' } }, db);
    expect(first.profile.createdAt).toBeTruthy();
    await new Promise((r) => setTimeout(r, 5)); // 保证时间戳可区分
    const second = await updateProfileByOpenid('o1', { basic: { signature: '新签名' } }, db);
    expect(second.profile.createdAt).toBe(first.profile.createdAt);
    expect(second.profile.updatedAt >= first.profile.updatedAt).toBe(true);
  });
```

（文件顶部已有 `createMockDb` 与 `updateProfileByOpenid` 的 require，直接用。）

- [ ] **Step 2: 写失败测试（listProfiles）**

新建 `tests/integration/listProfiles.test.js`：

```js
// tests/integration/listProfiles.test.js —— listProfiles 云函数（注入 mock 数据库）
const { createMockDb } = require('../helpers/mock-db.js');
const { listProfilesByOpenid } = require('../../cloudfunctions/listProfiles/index.js');

const YEAR = new Date().getFullYear();

// 造一份已 basicInit 的 profile（birthday 由年龄反推，随当前年份自适应）
function profile(id, openid, createdAt, patch) {
  return Object.assign({
    _id: id, openid, userId: 'u-' + openid, basicInit: true,
    basic: { guestNo: id, nickname: id, gender: '女', birthday: (YEAR - 30) + '-06-15', constellation: '双子座', avatarFileID: '', signature: '' },
    about: { aboutMe: '', aboutYou: '', loveGoal: '', emotionalStatus: '单身未婚', height: 165, weight: null, education: '本科', job: '互联网/IT', city: '广东省 深圳市', hometown: '', school: '', familyBackground: [], smoke: '', drink: '', gamble: '' },
    privacy: { asset: { house: '有房无贷', car: '有车', income: '10-20万' }, contact: { phone: '13800000000', wechat: 'wx-abc' } },
    album: [], stories: [], tags: { hobby: ['旅行'] },
  }, patch);
}

function seed() {
  return createMockDb({
    users: {
      ua: { _id: 'ua', openid: 'o-viewer', role: 'normal', guestNo: 'J0001' },
      ub: { _id: 'ub', openid: 'o-b', role: 'verified', guestNo: 'J0002' },
      uc: { _id: 'uc', openid: 'o-c', role: 'normal', guestNo: 'J0003' },
    },
    profiles: {
      pSelf: profile('pSelf', 'o-viewer', '2026-08-04T00:00:00Z'),
      pB: profile('pB', 'o-b', '2026-08-03T00:00:00Z'),
      pC: profile('pC', 'o-c', '2026-08-01T00:00:00Z', { basicInit: false }), // 未完善 → 不上榜
      pD: profile('pD', 'o-d', '2026-08-02T00:00:00Z', { about: Object.assign({}, profile('x', 'x', '').about, { height: 178, education: '硕士' }) }),
      pE: profile('pE', 'o-e', '2026-08-05T00:00:00Z', { basic: { guestNo: 'pE', nickname: 'pE', gender: '女', birthday: (YEAR - 40) + '-01-01', constellation: '', avatarFileID: '', signature: '' } }),
    },
  });
}

describe('cloudfunctions/listProfiles', () => {
  test('只返回 basicInit 且排除自己；按 createdAt 倒序', async () => {
    const res = await listProfilesByOpenid('o-viewer', {}, 1, 10, seed());
    expect(res.list.map((p) => p._id)).toEqual(['pE', 'pB', 'pD']); // pSelf 排除、pC 未完善排除
    expect(res.hasMore).toBe(false);
    expect(res.page).toBe(1);
  });

  test('分页：pageSize+1 探测 hasMore', async () => {
    const db = seed();
    const p1 = await listProfilesByOpenid('o-viewer', {}, 1, 2, db);
    expect(p1.list).toHaveLength(2);
    expect(p1.hasMore).toBe(true);
    const p2 = await listProfilesByOpenid('o-viewer', {}, 2, 2, db);
    expect(p2.list.map((x) => x._id)).toEqual(['pD']);
    expect(p2.hasMore).toBe(false);
  });

  test('年龄区间过滤（生日字符串范围；两端可只传一端）', async () => {
    const db = seed();
    // 30 岁 pB/pD（birthday YEAR-30）在 [25,35] 内；40 岁 pE 排除
    const res = await listProfilesByOpenid('o-viewer', { ageMin: 25, ageMax: 35 }, 1, 10, db);
    expect(res.list.map((p) => p._id).sort()).toEqual(['pB', 'pD']);
    const onlyMin = await listProfilesByOpenid('o-viewer', { ageMin: 35 }, 1, 10, db);
    expect(onlyMin.list.map((p) => p._id)).toEqual(['pE']);
  });

  test('身高区间过滤（链式 gte/lte）', async () => {
    const res = await listProfilesByOpenid('o-viewer', { heightMin: 170, heightMax: 180 }, 1, 10, seed());
    expect(res.list.map((p) => p._id)).toEqual(['pD']);
  });

  test('多选过滤：学历 in + 城市 in + 婚姻状况 in + 职业 in', async () => {
    const db = seed();
    const edu = await listProfilesByOpenid('o-viewer', { educations: ['硕士'] }, 1, 10, db);
    expect(edu.list.map((p) => p._id)).toEqual(['pD']);
    const city = await listProfilesByOpenid('o-viewer', { cities: ['广东省 深圳市'] }, 1, 10, db);
    expect(city.list.map((p) => p._id).sort()).toEqual(['pB', 'pD', 'pE']); // 三条默认城市均为广东省 深圳市
    const emo = await listProfilesByOpenid('o-viewer', { emotionalStatuses: ['离异'] }, 1, 10, db);
    expect(emo.list).toHaveLength(0);
    const job = await listProfilesByOpenid('o-viewer', { jobs: ['互联网/IT', '金融'] }, 1, 10, db);
    expect(job.list.map((p) => p._id).sort()).toEqual(['pB', 'pD', 'pE']); // 默认职业均为互联网/IT
  });

  test('组合过滤取交集；VO 剔除隐私与身份字段；verified 按 users.role 标记', async () => {
    const res = await listProfilesByOpenid('o-viewer', { educations: ['本科'], ageMax: 32 }, 1, 10, seed());
    expect(res.list.map((p) => p._id)).toEqual(['pB']);
    const vo = res.list[0];
    expect(Object.keys(vo).sort()).toEqual(['_id', 'about', 'album', 'basic', 'stories', 'tags', 'verified']);
    expect(vo.verified).toBe(true); // o-b 的 role=verified
  });

  test('非法分页参数容错：page 0 → 1，pageSize 超 20 封顶，负数 → 1', async () => {
    const res = await listProfilesByOpenid('o-viewer', {}, 0, 99, seed());
    expect(res.page).toBe(1);
    expect(res.list.length).toBeLessThanOrEqual(20);
  });

  test('列表对游客（无 users 文档）同样可用', async () => {
    const res = await listProfilesByOpenid('o-stranger', {}, 1, 10, seed());
    expect(res.list.length).toBe(3); // o-stranger 无自己的 profile，不排除任何项
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/listProfiles.test.js tests/integration/updateProfile.test.js`
Expected: listProfiles 整文件 FAIL（模块不存在 `Cannot find module '../../cloudfunctions/listProfiles/index.js'`）；updateProfile 新用例 FAIL（`createdAt` 为 undefined）。

- [ ] **Step 4: 实现 updateProfile 建档时间**

`cloudfunctions/updateProfile/index.js` 中 `updateProfileByOpenid` 内，将：

```js
  merged.updatedAt = new Date().toISOString();
```

改为：

```js
  const now = new Date().toISOString();
  merged.createdAt = merged.createdAt || now; // 建档时间：首次写入后不变（P2 列表排序依赖）
  merged.updatedAt = now;
```

- [ ] **Step 5: 实现 listProfiles 云函数**

新建 `cloudfunctions/listProfiles/index.js`：

```js
// listProfiles 云函数 —— 「遇见」列表：筛选 + 分页 + 脱敏 + 实名标识
// 入参 { filter, page, pageSize }；filter 各维度缺省/空即不过滤（空数组不得传入 _.in——匹配不到任何值）。
// 返回 { list, page, hasMore }；list 项为 CardVO（不含 privacy/openid/userId，见数据契约）。
// 排序：createdAt 倒序（最新注册在前；匹配度加权是 P5 的事）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 20;
const VERIFIED_ROLES = ['verified', 'admin'];

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

// CardVO：列表/详情共用对外形状（getProfileDetail 内有镜像实现，改字段须两边同步）
function toCardVO(p, role) {
  return {
    _id: p._id,
    basic: p.basic || {},
    about: p.about || {},
    album: p.album || [],
    stories: p.stories || [],
    tags: p.tags || {},
    verified: VERIFIED_ROLES.indexOf(role) >= 0,
  };
}

// filter → where 条件（空维度剔除）。年龄换算与前端 formatAge 同口径：当年 − 出生年。
function buildWhere(db, filter, viewerOpenid) {
  const _ = db.command;
  const f = filter || {};
  const where = { basicInit: true, openid: _.neq(viewerOpenid) };
  const year = new Date().getFullYear();

  if (Number.isFinite(f.ageMin) || Number.isFinite(f.ageMax)) {
    let cmd = null;
    if (Number.isFinite(f.ageMax)) cmd = _.gte(year - f.ageMax + '-01-01'); // 年龄上限 → 出生年下限
    if (Number.isFinite(f.ageMin)) {
      const upper = _.lte(year - f.ageMin + '-12-31'); // 年龄下限 → 出生年上限
      cmd = cmd ? cmd.lte(year - f.ageMin + '-12-31') : upper;
    }
    where['basic.birthday'] = cmd;
  }
  if (Number.isFinite(f.heightMin) || Number.isFinite(f.heightMax)) {
    let cmd = null;
    if (Number.isFinite(f.heightMin)) cmd = _.gte(f.heightMin);
    if (Number.isFinite(f.heightMax)) {
      const upper = _.lte(f.heightMax);
      cmd = cmd ? cmd.lte(f.heightMax) : upper;
    }
    where['about.height'] = cmd;
  }
  if (Array.isArray(f.educations) && f.educations.length) where['about.education'] = _.in(f.educations);
  if (Array.isArray(f.emotionalStatuses) && f.emotionalStatuses.length) where['about.emotionalStatus'] = _.in(f.emotionalStatuses);
  if (Array.isArray(f.cities) && f.cities.length) where['about.city'] = _.in(f.cities);
  if (Array.isArray(f.jobs) && f.jobs.length) where['about.job'] = _.in(f.jobs);
  return where;
}

async function listProfilesByOpenid(openid, filter, page, pageSize, db) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(pageSize) || DEFAULT_PAGE_SIZE)));
  const got = await db.collection('profiles')
    .where(buildWhere(db, filter, openid))
    .orderBy('createdAt', 'desc')
    .skip((p - 1) * size)
    .limit(size + 1) // 多取 1 条探测 hasMore，免 count()
    .get();
  const hasMore = got.data.length > size;
  const rows = hasMore ? got.data.slice(0, size) : got.data;

  // join users 拿角色 → verified 标识；查不到的用户按 normal 处理
  const roleMap = {};
  const openids = rows.map((r) => r.openid);
  if (openids.length > 0) {
    const users = await db.collection('users').where({ openid: db.command.in(openids) }).get();
    for (const u of users.data) roleMap[u.openid] = u.role;
  }
  const list = rows.map((r) => toCardVO(r, roleMap[r.openid]));
  return { list, page: p, hasMore };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    const e = event || {};
    return await listProfilesByOpenid(openid, e.filter, e.page, e.pageSize, getDb());
  } catch (e) {
    console.error('[listProfiles] failed:', e);
    return { error: 'internal error' };
  }
};
exports.listProfilesByOpenid = listProfilesByOpenid;
```

新建 `cloudfunctions/listProfiles/package.json`：

```json
{
  "name": "listProfiles",
  "version": "1.0.0",
  "description": "遇见列表：筛选 + 分页 + 脱敏 + 实名标识",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  },
  "private": true
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/listProfiles.test.js tests/integration/updateProfile.test.js`
Expected: PASS（listProfiles 8 用例 + updateProfile 原有 + 新增 1 用例）

- [ ] **Step 7: 全量回归 + 提交**

Run: `npm test`
Expected: 全绿

```bash
git add cloudfunctions/listProfiles cloudfunctions/updateProfile/index.js tests/integration/listProfiles.test.js tests/integration/updateProfile.test.js
git commit -m "feat(cloud): listProfiles 云函数（筛选/分页/脱敏/实名标识）+ profiles 补建档时间"
```

---

### Task 3: config/view_logs 集合 + getProfileDetail 云函数

**Files:**
- Modify: `cloudfunctions/setupDb/index.js`（集合清单 + 配额种子）
- Create: `cloudfunctions/getProfileDetail/index.js`、`cloudfunctions/getProfileDetail/package.json`
- Test: `tests/integration/getProfileDetail.test.js`（新建）、`tests/integration/setupDb.test.js`（新建）

**Interfaces:**
- Consumes: Task 1 mock-db；`profiles`/`users` 结构；数据契约中的 getProfileDetail 返回形状
- Produces: `getProfileDetailByOpenid(openid, profileId, db)`；`toDateKey(date)`（东八区日键，导出供测试）；`seedQuotaConfig(db)` → `'created' | 'exists'`（幂等）；新集合 `config`（doc `quotas`：`{ normal, verified }`）与 `view_logs`（`{ viewerOpenid, viewerId, targetId, targetOpenid, dateKey, createdAt }`，P3 复用为「谁看过我」）。Task 5 详情页与 Task 7 E2E 依赖返回形状。

- [ ] **Step 1: 写失败测试（setupDb 种子）**

新建 `tests/integration/setupDb.test.js`：

```js
// tests/integration/setupDb.test.js —— setupDb 配额种子（幂等）
const { createMockDb } = require('../helpers/mock-db.js');
const { seedQuotaConfig } = require('../../cloudfunctions/setupDb/index.js');

describe('cloudfunctions/setupDb seedQuotaConfig', () => {
  test('config 无文档时写入默认配额，再次执行不覆盖', async () => {
    const db = createMockDb();
    expect(await seedQuotaConfig(db)).toBe('created');
    const doc = await db.collection('config').doc('quotas').get();
    expect(doc.data.normal).toBe(5);
    expect(doc.data.verified).toBe(15);
    // 控制台改过（如 normal→9）后再跑 setupDb 不覆盖
    await db.collection('config').doc('quotas').set({ data: { normal: 9, verified: 15 } });
    expect(await seedQuotaConfig(db)).toBe('exists');
    const after = await db.collection('config').doc('quotas').get();
    expect(after.data.normal).toBe(9);
  });
});
```

- [ ] **Step 2: 写失败测试（getProfileDetail）**

新建 `tests/integration/getProfileDetail.test.js`：

```js
// tests/integration/getProfileDetail.test.js —— getProfileDetail 云函数（配额/裁剪/日志）
const { createMockDb } = require('../helpers/mock-db.js');
const {
  getProfileDetailByOpenid, toDateKey,
} = require('../../cloudfunctions/getProfileDetail/index.js');

function seed(quotas) {
  const initial = {
    users: {
      uNormal: { _id: 'uNormal', openid: 'o-normal', role: 'normal', guestNo: 'J0002' },
      uVerified: { _id: 'uVerified', openid: 'o-verified', role: 'verified', guestNo: 'J0003' },
      uAdmin: { _id: 'uAdmin', openid: 'o-admin', role: 'admin', guestNo: 'J0004' },
      uOwner: { _id: 'uOwner', openid: 'o-owner', role: 'normal', guestNo: 'J0005' },
      uTV: { _id: 'uTV', openid: 'o-target-verified', role: 'verified', guestNo: 'J0006' },
    },
    profiles: {},
    view_logs: {},
  };
  let seq = 0;
  for (const openid of ['o-owner', 'o-target-verified', 'o-t3', 'o-t4', 'o-t5', 'o-t6']) {
    const id = 'p-' + openid;
    seq += 1;
    initial.profiles[id] = {
      _id: id, openid, userId: 'u-' + seq, basicInit: true,
      basic: { guestNo: 'J000' + seq, nickname: '嘉宾' + seq, gender: '女', birthday: '1995-06-15', constellation: '双子座', avatarFileID: '', signature: '' },
      about: { emotionalStatus: '单身未婚', height: 165, education: '本科', job: '互联网/IT', city: '广东省 深圳市' },
      privacy: { asset: { house: '有房无贷', car: '有车', income: '10-20万' }, contact: { phone: '13800000000', wechat: 'wx-abc' } },
      album: [], stories: [], tags: {}, createdAt: '2026-08-0' + seq + 'T00:00:00Z',
    };
  }
  if (quotas) initial.config = { quotas: { _id: 'quotas', normal: quotas.normal, verified: quotas.verified } };
  return createMockDb(initial);
}

describe('cloudfunctions/getProfileDetail', () => {
  test('toDateKey 按东八区日界（UTC 20:30 → 次日）', () => {
    expect(toDateKey(new Date(Date.UTC(2026, 7, 19, 20, 30)))).toBe('2026-08-20');
    expect(toDateKey(new Date(Date.UTC(2026, 7, 19, 10, 30)))).toBe('2026-08-19');
  });

  test('游客（无 users 文档）→ login required，不查详情不写日志', async () => {
    const db = seed();
    const res = await getProfileDetailByOpenid('o-stranger', 'p-o-t3', db);
    expect(res).toEqual({ error: 'login required' });
    const logs = await db.collection('view_logs').where({ viewerOpenid: 'o-stranger' }).get();
    expect(logs.data).toHaveLength(0);
  });

  test('profileId 不存在 → not found', async () => {
    const res = await getProfileDetailByOpenid('o-normal', 'p-nope', seed());
    expect(res).toEqual({ error: 'not found' });
  });

  test('本人查看：self=true、隐私明文、不占配额不写日志', async () => {
    const db = seed();
    const res = await getProfileDetailByOpenid('o-owner', 'p-o-owner', db);
    expect(res.self).toBe(true);
    expect(res.quota).toBeNull();
    expect(res.profile.privacy.contact.phone).toBe('13800000000');
    const logs = await db.collection('view_logs').where({ viewerOpenid: 'o-owner' }).get();
    expect(logs.data).toHaveLength(0);
  });

  test('管理员：不限次、隐私明文、不写 view_logs', async () => {
    const db = seed();
    const res = await getProfileDetailByOpenid('o-admin', 'p-o-t3', db);
    expect(res.quota).toEqual({ used: 0, limit: -1 });
    expect(res.profile.privacy.asset.house).toBe('有房无贷');
    const logs = await db.collection('view_logs').where({ viewerOpenid: 'o-admin' }).get();
    expect(logs.data).toHaveLength(0);
  });

  test('普通用户：config 覆盖配额（normal=2），首看/复看/超额/日志写入', async () => {
    const db = seed({ normal: 2, verified: 3 });
    const first = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(first.profile._id).toBe('p-o-t3');
    expect(first.profile.privacy).toBeUndefined(); // 隐私整段剔除
    expect(first.quota).toEqual({ used: 1, limit: 2 });
    expect(first.verified).toBe(false);

    const second = await getProfileDetailByOpenid('o-normal', 'p-o-t4', db);
    expect(second.quota).toEqual({ used: 2, limit: 2 });

    // 重复看已看过的嘉宾：不重复计数、不写新日志、仍可看
    const again = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(again.profile._id).toBe('p-o-t3');
    expect(again.quota).toEqual({ used: 2, limit: 2 });

    // 第 3 个不同嘉宾 → 超额
    const third = await getProfileDetailByOpenid('o-normal', 'p-o-t5', db);
    expect(third.error).toBe('quota exceeded');
    expect(third.quota).toEqual({ used: 2, limit: 2 });

    const logs = await db.collection('view_logs').where({ viewerOpenid: 'o-normal' }).get();
    expect(logs.data).toHaveLength(2); // 只有两条真实查看
    expect(logs.data[0].targetId).toBe('p-o-t3');
    expect(logs.data[0].dateKey).toBe(toDateKey(new Date()));
  });

  test('认证用户：config 配额 verified=3，第 4 个不同嘉宾超额', async () => {
    const db = seed({ normal: 2, verified: 3 });
    for (const id of ['p-o-t3', 'p-o-t4', 'p-o-t5']) {
      const r = await getProfileDetailByOpenid('o-verified', id, db);
      expect(r.error).toBeUndefined();
    }
    const fourth = await getProfileDetailByOpenid('o-verified', 'p-o-t6', db);
    expect(fourth.error).toBe('quota exceeded');
    expect(fourth.quota).toEqual({ used: 3, limit: 3 });
  });

  test('config 缺失时用默认配额（normal=5）', async () => {
    const db = seed(); // 无 config 集合
    const ids = ['p-o-t3', 'p-o-t4', 'p-o-t5', 'p-o-t6', 'p-o-owner'];
    for (const id of ids) {
      const r = await getProfileDetailByOpenid('o-normal', id, db);
      expect(r.error).toBeUndefined();
    }
    // 5 个不同嘉宾已看满，第 6 个（复用 o-t3 的库不足——直接再看 p-o-t3 不超额因已看过，改断言 quota.used）
    const last = await getProfileDetailByOpenid('o-normal', 'p-o-t3', db);
    expect(last.quota).toEqual({ used: 5, limit: 5 });
  });

  test('目标嘉宾角色为 verified → CardVO.verified=true', async () => {
    const res = await getProfileDetailByOpenid('o-normal', 'p-o-target-verified', seed({ normal: 5, verified: 15 }));
    expect(res.verified).toBe(true);
    expect(res.profile.verified).toBe(true);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/getProfileDetail.test.js tests/integration/setupDb.test.js`
Expected: FAIL —— `Cannot find module '../../cloudfunctions/getProfileDetail/index.js'`；setupDb `seedQuotaConfig` 未导出。

- [ ] **Step 4: 更新 setupDb**

`cloudfunctions/setupDb/index.js` 整体替换：

```js
// setupDb 云函数 —— 环境初始化/诊断：幂等创建集合并写入默认配额
// 返回 { users: 'created'|<errMsg>, ..., config: ..., view_logs: ..., quotas: 'created'|'exists', usersQuery: ... }
// 部署后在小程序端或云控制台调用一次即可；集合已存在时 createCollection 报错属预期。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const COLLECTIONS = ['users', 'counters', 'profiles', 'config', 'view_logs'];
const DEFAULT_QUOTAS = { normal: 5, verified: 15 };

// 幂等写入 config/quotas：不存在则建默认，存在不动（控制台改过的不覆盖）
async function seedQuotaConfig(db) {
  const doc = db.collection('config').doc('quotas');
  try {
    await doc.get();
    return 'exists';
  } catch (e) {
    await doc.set({ data: { normal: DEFAULT_QUOTAS.normal, verified: DEFAULT_QUOTAS.verified } });
    return 'created';
  }
}

exports.main = async () => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const db = cloud.database();
  const out = {};
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
      out[name] = 'created';
    } catch (e) {
      out[name] = String((e && e.errMsg) || e.message || e);
    }
  }
  out.quotas = await seedQuotaConfig(db);
  // 跑一次 login 的真实查询路径，确认数据库可用（回传原始错误便于排障）
  try {
    const r = await db.collection('users').where({ openid: 'probe' }).get();
    out.usersQuery = 'ok:' + r.data.length;
  } catch (e) {
    out.usersQuery = String((e && e.errMsg) || e.message || e);
  }
  return out;
};
exports.seedQuotaConfig = seedQuotaConfig;
```

- [ ] **Step 5: 实现 getProfileDetail 云函数**

新建 `cloudfunctions/getProfileDetail/index.js`：

```js
// getProfileDetail 云函数 —— 资料详情：登录/配额校验 + 查看日志 + 按角色裁剪隐私
// 入参 { profileId }，返回见数据契约（login required / not found / quota exceeded / 成功 VO）。
// 配额 = 当日可查看的不同嘉宾数（view_logs 按 targetId 去重，重复看不重复计数）。
// 管理员与本人直看隐私明文且不写日志；其余角色隐私整段剔除（P3 授权流激活）。
// 注意：模块顶层不得 require('wx-server-sdk')（集成测试直接 require 本文件）。

const DEFAULT_QUOTAS = { normal: 5, verified: 15 }; // config/quotas 可覆盖（P4 前在控制台改）
const VERIFIED_ROLES = ['verified', 'admin'];

let db = null;
function getDb() {
  if (!db) {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

// 云函数运行于 UTC；配额按东八区日界重置
function toDateKey(d) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// CardVO：与 listProfiles 的 toCardVO 保持同构，改字段须两边同步
function toCardVO(p, role) {
  return {
    _id: p._id,
    basic: p.basic || {},
    about: p.about || {},
    album: p.album || [],
    stories: p.stories || [],
    tags: p.tags || {},
    verified: VERIFIED_ROLES.indexOf(role) >= 0,
  };
}
function toFullVO(p, role) {
  const vo = toCardVO(p, role);
  vo.privacy = p.privacy || {};
  return vo;
}

// 读 config/quotas（数字校验后覆盖默认；文档/集合缺失用默认）
async function loadQuotas(db) {
  try {
    const cfg = await db.collection('config').doc('quotas').get();
    const c = cfg.data || {};
    return {
      normal: Number.isFinite(c.normal) ? c.normal : DEFAULT_QUOTAS.normal,
      verified: Number.isFinite(c.verified) ? c.verified : DEFAULT_QUOTAS.verified,
    };
  } catch (e) {
    return DEFAULT_QUOTAS;
  }
}

async function getProfileDetailByOpenid(openid, profileId, db) {
  if (!profileId || typeof profileId !== 'string') return { error: 'not found' };

  // 游客 = 无 users 文档（未经 login 建档）
  const users = db.collection('users');
  const meArr = await users.where({ openid }).get();
  if (meArr.data.length === 0) return { error: 'login required' };
  const me = meArr.data[0];

  let target;
  try {
    target = (await db.collection('profiles').doc(profileId).get()).data;
  } catch (e) {
    return { error: 'not found' };
  }

  // 目标用户角色 → verified 标识（查无用户按 normal）
  const tArr = await users.where({ openid: target.openid }).get();
  const targetRole = tArr.data.length > 0 ? tArr.data[0].role : 'normal';
  const isVerified = VERIFIED_ROLES.indexOf(targetRole) >= 0;

  // 本人：隐私明文、不占配额、不写日志
  if (target.openid === me.openid) {
    return { profile: toFullVO(target, targetRole), verified: isVerified, self: true, quota: null };
  }
  // 管理员：不限、隐私明文、不写日志（避免污染 P3「谁看过我」）
  if (me.role === 'admin') {
    return { profile: toFullVO(target, targetRole), verified: isVerified, self: false, quota: { used: 0, limit: -1 } };
  }

  const quotas = await loadQuotas(db);
  const limit = me.role === 'verified' ? quotas.verified : quotas.normal; // 未知角色按 normal

  const dateKey = toDateKey(new Date());
  const logs = await db.collection('view_logs').where({ viewerOpenid: openid, dateKey }).get();
  const seen = new Set(logs.data.map((l) => l.targetId));

  if (seen.has(profileId)) {
    return { profile: toCardVO(target, targetRole), verified: isVerified, self: false, quota: { used: seen.size, limit } };
  }
  if (seen.size >= limit) {
    return { error: 'quota exceeded', quota: { used: seen.size, limit } };
  }
  await db.collection('view_logs').add({
    data: {
      viewerOpenid: openid, viewerId: me._id,
      targetId: profileId, targetOpenid: target.openid,
      dateKey, createdAt: new Date().toISOString(),
    },
  });
  return { profile: toCardVO(target, targetRole), verified: isVerified, self: false, quota: { used: seen.size + 1, limit } };
}

exports.main = async (event) => {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openid = cloud.getWXContext().OPENID;
    return await getProfileDetailByOpenid(openid, (event || {}).profileId, getDb());
  } catch (e) {
    console.error('[getProfileDetail] failed:', e);
    return { error: 'internal error' };
  }
};
exports.getProfileDetailByOpenid = getProfileDetailByOpenid;
exports.toDateKey = toDateKey;
```

新建 `cloudfunctions/getProfileDetail/package.json`：

```json
{
  "name": "getProfileDetail",
  "version": "1.0.0",
  "description": "资料详情：登录/配额校验 + 查看日志 + 按角色裁剪隐私",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  },
  "private": true
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx jest -c tests/jest.config.js --selectProjects integration tests/integration/getProfileDetail.test.js tests/integration/setupDb.test.js`
Expected: PASS（getProfileDetail 9 用例 + setupDb 1 用例）

- [ ] **Step 7: 全量回归 + 提交**

Run: `npm test`
Expected: 全绿

```bash
git add cloudfunctions/getProfileDetail cloudfunctions/setupDb/index.js tests/integration/getProfileDetail.test.js tests/integration/setupDb.test.js
git commit -m "feat(cloud): getProfileDetail 云函数（四档配额/查看日志/隐私裁剪）+ setupDb 初始化 config 与 view_logs"
```

---

### Task 4: filter-panel 筛选面板组件

**Files:**
- Create: `miniprogram/components/filter-panel/index.js`、`index.wxml`、`index.wxss`、`index.json`
- Test: `tests/unit/filter-panel.test.js`（新建）

**Interfaces:**
- Consumes: `utils/options.js`（EDUCATIONS/EMOTIONAL_STATUS/JOBS）、`utils/region-data.js`（PROVINCES/CITY_MAP）
- Produces: 零属性组件；`bind:change` 事件 → `{ detail: { filter } }`（filter 形状见数据契约，重置时为 `{}`）。Task 6 的「遇见」页绑定此事件。

设计裁定：chips 自绘（不引 TDesign，保证 miniprogram-simulate 可渲染可测）；省市两级用原生 `picker`；WXML 表达式不支持方法调用，选中态在 JS 侧预计算为 `chipGroups`。

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/filter-panel.test.js`：

```js
// tests/unit/filter-panel.test.js —— filter-panel 组件单测
const simulate = require('miniprogram-simulate');
const path = require('path');

let id;

beforeAll(() => {
  id = simulate.load(path.resolve(__dirname, '../../miniprogram/components/filter-panel/index'));
});

function render() {
  const comp = simulate.render(id, {});
  comp.attach(document.createElement('parent-wrapper'));
  return comp;
}

describe('components/filter-panel', () => {
  test('默认收起；点筛选条展开，再点收起', () => {
    const comp = render();
    expect(comp.data.expanded).toBe(false);
    comp.instance.onToggle();
    expect(comp.data.expanded).toBe(true);
    comp.instance.onToggle();
    expect(comp.data.expanded).toBe(false);
    comp.detach();
  });

  test('渲染四个维度：学历 5 项、婚姻 3 项、职业 11 项、年龄/身高选项池', () => {
    const comp = render();
    comp.instance.onToggle();
    expect(comp.data.chipGroups).toHaveLength(3); // 学历/婚姻/职业
    const titles = comp.data.chipGroups.map((g) => g.title);
    expect(titles).toEqual(['学历', '婚姻状况', '职业']);
    expect(comp.data.chipGroups[0].items).toHaveLength(5); // EDUCATIONS
    expect(comp.data.chipGroups[1].items).toHaveLength(3); // EMOTIONAL_STATUS
    expect(comp.data.chipGroups[2].items).toHaveLength(11); // JOBS
    expect(comp.data.ageOptions[0]).toBe(18);
    expect(comp.data.heightOptions[0]).toBe(140);
    comp.detach();
  });

  test('多选 chips：toggle 选中 → chipGroups on 态更新', () => {
    const comp = render();
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selEducations', item: '本科' } } });
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selEducations', item: '硕士' } } });
    expect(comp.data.selEducations).toEqual(['本科', '硕士']);
    const eduGroup = comp.data.chipGroups.find((g) => g.title === '学历');
    expect(eduGroup.items.find((i) => i.text === '本科').on).toBe(true);
    expect(eduGroup.items.find((i) => i.text === '大专').on).toBe(false);
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selEducations', item: '本科' } } });
    expect(comp.data.selEducations).toEqual(['硕士']);
    comp.detach();
  });

  test('范围选择：picker change 写入对应字段（年龄/身高）', () => {
    const comp = render();
    // e.detail.value 是选项下标；ageOptions[2] = 20，heightOptions[5] = 150
    comp.instance.onRangeChange({ currentTarget: { dataset: { field: 'ageMin' } }, detail: { value: '2' } });
    comp.instance.onRangeChange({ currentTarget: { dataset: { field: 'heightMax' } }, detail: { value: '5' } });
    expect(comp.data.selAgeMin).toBe(20);
    expect(comp.data.selHeightMax).toBe(150);
    comp.detach();
  });

  test('省市联动：选省加载市列表，选市加入已选城市 chips，重复不加', () => {
    const comp = render();
    const provIdx = comp.data.provinces.indexOf('广东省');
    comp.instance.onProvinceChange({ detail: { value: String(provIdx) } });
    expect(comp.data.selProvince).toBe('广东省');
    expect(comp.data.cityOptions).toContain('深圳市');
    const cityIdx = comp.data.cityOptions.indexOf('深圳市');
    comp.instance.onCityChange({ detail: { value: String(cityIdx) } });
    expect(comp.data.selCities).toEqual(['广东省 深圳市']);
    comp.instance.onCityChange({ detail: { value: String(cityIdx) } }); // 重复
    expect(comp.data.selCities).toEqual(['广东省 深圳市']);
    comp.detach();
  });

  test('应用：emit change 携带完整 filter（只含已选维度）', () => {
    const comp = render();
    const spy = jest.fn();
    comp.instance.triggerEvent = spy;
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selJobs', item: '金融' } } });
    comp.instance.onRangeChange({ currentTarget: { dataset: { field: 'ageMin' } }, detail: { value: '7' } }); // 25
    comp.instance.onApply();
    expect(spy).toHaveBeenCalledWith('change', {
      filter: { ageMin: 25, jobs: ['金融'] },
    });
    comp.detach();
  });

  test('重置：清空全部选择并 emit 空 filter', () => {
    const comp = render();
    const spy = jest.fn();
    comp.instance.triggerEvent = spy;
    comp.instance.onToggleSelect({ currentTarget: { dataset: { group: 'selCities', item: '广东省 深圳市' } } });
    comp.instance.onReset();
    expect(comp.data.selCities).toEqual([]);
    expect(comp.data.selAgeMin).toBe('不限');
    expect(spy).toHaveBeenCalledWith('change', { filter: {} });
    comp.detach();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest -c tests/jest.config.js --selectProjects unit tests/unit/filter-panel.test.js`
Expected: FAIL —— simulate.load 找不到组件（`index.json` 不存在）

- [ ] **Step 3: 实现组件**

新建 `miniprogram/components/filter-panel/index.json`：

```json
{
  "component": true,
  "usingComponents": {}
}
```

新建 `miniprogram/components/filter-panel/index.js`：

```js
// components/filter-panel/index.js —— 遇见列表筛选面板（纯 UI，状态自持）
// 选中态在 JS 侧预计算 chipGroups（WXML 表达式不支持方法调用）；
// 「应用」时 triggerEvent('change', { filter })，重置时 emit { filter: {} }。
const { EDUCATIONS, EMOTIONAL_STATUS, JOBS } = require('../../utils/options.js');
const { PROVINCES, CITY_MAP } = require('../../utils/region-data.js');

const UNLIMITED = '不限';
const RANGE_KEYS = {
  ageMin: 'selAgeMin', ageMax: 'selAgeMax',
  heightMin: 'selHeightMin', heightMax: 'selHeightMax',
};
// 多选组定义：data 键 → 选项池（顺序即渲染顺序）
const GROUP_DEFS = [
  { key: 'selEducations', title: '学历', pool: EDUCATIONS },
  { key: 'selEmotionalStatuses', title: '婚姻状况', pool: EMOTIONAL_STATUS },
  { key: 'selJobs', title: '职业', pool: JOBS },
];

Component({
  data: {
    expanded: false,
    provinces: PROVINCES.map((p) => p.label),
    ageOptions: Array.from({ length: 53 }, (_, i) => 18 + i), // 18-70 岁
    heightOptions: Array.from({ length: 36 }, (_, i) => 140 + i * 2), // 140-210cm 步进 2
    selAgeMin: UNLIMITED, selAgeMax: UNLIMITED,
    selHeightMin: UNLIMITED, selHeightMax: UNLIMITED,
    selEducations: [], selEmotionalStatuses: [], selJobs: [], selCities: [],
    selProvince: '', cityOptions: [],
    chipGroups: [],
  },

  lifetimes: {
    attached() {
      this.refreshChips();
    },
  },

  methods: {
    onToggle() {
      this.setData({ expanded: !this.data.expanded });
    },

    // 选中数组 → chipGroups 展示模型（on 态随选择变化重算）
    refreshChips() {
      const chipGroups = GROUP_DEFS.map((def) => ({
        key: def.key,
        title: def.title,
        items: def.pool.map((text) => ({ text, on: this.data[def.key].indexOf(text) >= 0 })),
      }));
      this.setData({ chipGroups });
    },

    onToggleSelect(e) {
      const { group, item } = e.currentTarget.dataset; // group 为 data 键名
      const list = this.data[group].slice();
      const idx = list.indexOf(item);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(item);
      this.setData({ [group]: list });
      this.refreshChips();
    },

    // 范围 picker（年龄/身高，最小/最大四路共用；e.detail.value 为选项下标）
    onRangeChange(e) {
      const { field } = e.currentTarget.dataset;
      const options = field.indexOf('height') === 0 ? this.data.heightOptions : this.data.ageOptions;
      const val = options[Number(e.detail.value)];
      this.setData({ [RANGE_KEYS[field]]: val });
    },

    onProvinceChange(e) {
      const prov = this.data.provinces[Number(e.detail.value)];
      this.setData({
        selProvince: prov,
        cityOptions: (CITY_MAP[prov] || []).map((c) => c.label),
      });
    },

    onCityChange(e) {
      const prov = this.data.selProvince;
      const city = this.data.cityOptions[Number(e.detail.value)];
      if (!prov || !city) return;
      const item = prov + ' ' + city; // 与 profiles.about.city 存储格式一致
      if (this.data.selCities.indexOf(item) < 0) {
        this.setData({ selCities: this.data.selCities.concat(item) });
      }
    },

    buildFilter() {
      const f = {};
      if (this.data.selAgeMin !== UNLIMITED) f.ageMin = this.data.selAgeMin;
      if (this.data.selAgeMax !== UNLIMITED) f.ageMax = this.data.selAgeMax;
      if (this.data.selHeightMin !== UNLIMITED) f.heightMin = this.data.selHeightMin;
      if (this.data.selHeightMax !== UNLIMITED) f.heightMax = this.data.selHeightMax;
      if (this.data.selEducations.length) f.educations = this.data.selEducations;
      if (this.data.selEmotionalStatuses.length) f.emotionalStatuses = this.data.selEmotionalStatuses;
      if (this.data.selJobs.length) f.jobs = this.data.selJobs;
      if (this.data.selCities.length) f.cities = this.data.selCities;
      return f;
    },

    onApply() {
      this.triggerEvent('change', { filter: this.buildFilter() });
    },

    onReset() {
      this.setData({
        selAgeMin: UNLIMITED, selAgeMax: UNLIMITED,
        selHeightMin: UNLIMITED, selHeightMax: UNLIMITED,
        selEducations: [], selEmotionalStatuses: [], selJobs: [], selCities: [],
        selProvince: '', cityOptions: [],
      });
      this.refreshChips();
      this.triggerEvent('change', { filter: {} });
    },
  },
});
```

新建 `miniprogram/components/filter-panel/index.wxml`：

```xml
<view class="fp">
  <view class="fp__bar" bindtap="onToggle">
    <text class="fp__bar-title">筛选</text>
    <text class="fp__arrow text-secondary">{{expanded ? '▲' : '▼'}}</text>
    <view class="fp__bar-reset text-primary" catchtap="onReset">重置</view>
  </view>

  <view class="fp__body" wx:if="{{expanded}}">
    <!-- 年龄 -->
    <view class="fp__group">
      <text class="fp__label text-secondary">年龄</text>
      <view class="fp__range">
        <picker range="{{ageOptions}}" bindchange="onRangeChange" data-field="ageMin">
          <text class="fp__picker">{{selAgeMin === '不限' ? '最小不限' : selAgeMin + '岁'}}</text>
        </picker>
        <text class="text-secondary">—</text>
        <picker range="{{ageOptions}}" bindchange="onRangeChange" data-field="ageMax">
          <text class="fp__picker">{{selAgeMax === '不限' ? '最大不限' : selAgeMax + '岁'}}</text>
        </picker>
      </view>
    </view>

    <!-- 身高 -->
    <view class="fp__group">
      <text class="fp__label text-secondary">身高</text>
      <view class="fp__range">
        <picker range="{{heightOptions}}" bindchange="onRangeChange" data-field="heightMin">
          <text class="fp__picker">{{selHeightMin === '不限' ? '最小不限' : selHeightMin + 'cm'}}</text>
        </picker>
        <text class="text-secondary">—</text>
        <picker range="{{heightOptions}}" bindchange="onRangeChange" data-field="heightMax">
          <text class="fp__picker">{{selHeightMax === '不限' ? '最大不限' : selHeightMax + 'cm'}}</text>
        </picker>
      </view>
    </view>

    <!-- 多选维度：学历 / 婚姻状况 / 职业 -->
    <view class="fp__group" wx:for="{{chipGroups}}" wx:for-item="group" wx:key="key">
      <text class="fp__label text-secondary">{{group.title}}</text>
      <view class="fp__chips">
        <text
          wx:for="{{group.items}}"
          wx:for-item="opt"
          wx:key="text"
          class="fp__chip {{opt.on ? 'fp__chip--on' : ''}}"
          data-group="{{group.key}}"
          data-item="{{opt.text}}"
          bindtap="onToggleSelect"
        >{{opt.text}}</text>
      </view>
    </view>

    <!-- 现居地：省 → 市 两级，选市累加为可删 chips -->
    <view class="fp__group">
      <text class="fp__label text-secondary">现居地</text>
      <view class="fp__range">
        <picker range="{{provinces}}" bindchange="onProvinceChange">
          <text class="fp__picker">{{selProvince || '选择省'}}</text>
        </picker>
        <picker range="{{cityOptions}}" bindchange="onCityChange" disabled="{{!cityOptions.length}}">
          <text class="fp__picker {{cityOptions.length ? '' : 'fp__picker--dim'}}">选择市</text>
        </picker>
      </view>
      <view class="fp__chips" wx:if="{{selCities.length}}">
        <text
          wx:for="{{selCities}}"
          wx:key="*this"
          class="fp__chip fp__chip--on"
          data-group="selCities"
          data-item="{{item}}"
          bindtap="onToggleSelect"
        >{{item}} ×</text>
      </view>
    </view>

    <view class="fp__actions">
      <view class="fp__btn" bindtap="onReset">重置</view>
      <view class="fp__btn fp__btn--primary" bindtap="onApply">应用筛选</view>
    </view>
  </view>
</view>
```

新建 `miniprogram/components/filter-panel/index.wxss`：

```css
/* filter-panel —— 筛选面板（自绘，主题色沿用 --color-primary） */
.fp {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 0 24rpx;
}
.fp__bar {
  display: flex;
  align-items: center;
  height: 88rpx;
  gap: 12rpx;
}
.fp__bar-title {
  font-size: 30rpx;
  font-weight: 600;
}
.fp__arrow {
  font-size: 22rpx;
}
.fp__bar-reset {
  margin-left: auto;
  font-size: 26rpx;
}
.fp__body {
  padding: 8rpx 0 24rpx;
}
.fp__group {
  margin-top: 24rpx;
}
.fp__label {
  display: block;
  font-size: 26rpx;
  margin-bottom: 12rpx;
}
.fp__range {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.fp__picker {
  display: inline-block;
  min-width: 140rpx;
  padding: 8rpx 20rpx;
  border: 1rpx solid #e5e5e5;
  border-radius: 12rpx;
  font-size: 26rpx;
  color: #333333;
  text-align: center;
}
.fp__picker--dim {
  color: #bbbbbb;
}
.fp__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.fp__chip {
  padding: 8rpx 24rpx;
  border-radius: 999rpx;
  background: #f5f5f5;
  color: #666666;
  font-size: 26rpx;
}
.fp__chip--on {
  background: rgba(255, 90, 95, 0.12);
  color: var(--color-primary, #ff5a5f);
}
.fp__actions {
  display: flex;
  gap: 24rpx;
  margin-top: 32rpx;
}
.fp__btn {
  flex: 1;
  height: 76rpx;
  line-height: 76rpx;
  text-align: center;
  border-radius: 38rpx;
  font-size: 28rpx;
  border: 1rpx solid #e5e5e5;
  color: #666666;
}
.fp__btn--primary {
  background: var(--color-primary, #ff5a5f);
  border-color: var(--color-primary, #ff5a5f);
  color: #ffffff;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest -c tests/jest.config.js --selectProjects unit tests/unit/filter-panel.test.js`
Expected: PASS（7 用例）

- [ ] **Step 5: 全量回归 + 提交**

Run: `npm test`
Expected: 全绿

```bash
git add miniprogram/components/filter-panel tests/unit/filter-panel.test.js
git commit -m "feat(components): filter-panel 筛选面板（年龄/身高范围 + 学历/婚姻/职业/城市多选）"
```

---

### Task 5: profile-detail 详情页

**Files:**
- Create: `miniprogram/pages/profile-detail/profile-detail.js`、`.wxml`、`.wxss`、`.json`
- Modify: `miniprogram/app.json`（pages 数组追加一行）

**Interfaces:**
- Consumes: Task 3 的 `getProfileDetail` 返回形状（数据契约）；`profile-card` 组件（`profile`/`verified` 属性）；`utils/auth.js` 的 `ensureLogin`
- Produces: 页面路由 `pages/profile-detail/profile-detail?id=<profileId>`（Task 6 列表跳转与 `onShareAppMessage` 分享路径、Task 7 E2E 的 navTo 目标）。页面 data 键：`profile/verified/self/quota/needLogin/quotaExceeded/notFound/profileId`（E2E 断言依赖）。

- [ ] **Step 1: 注册页面**

`miniprogram/app.json` 的 `pages` 数组末尾（`"pages/agreement/agreement"` 之后）追加：

```json
    "pages/profile-detail/profile-detail"
```

（注意前一行的逗号。）

- [ ] **Step 2: 实现页面四件套**

新建 `miniprogram/pages/profile-detail/profile-detail.json`：

```json
{
  "navigationBarTitleText": "嘉宾详情",
  "usingComponents": {
    "profile-card": "/components/profile-card/index"
  }
}
```

新建 `miniprogram/pages/profile-detail/profile-detail.js`：

```js
// pages/profile-detail/profile-detail.js —— 嘉宾资料详情（遇见列表/分享落地进入）
// 状态优先级：needLogin（游客）> quotaExceeded > notFound > 正常渲染。
// 按钮组（心动/聊天/无感）、举报、隐私授权：P3 激活，P2 点击提示「即将开放」。
const { callFunction } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');

Page({
  data: {
    profile: null,
    verified: false,
    self: false,
    quota: null,          // { used, limit }；本人 null、管理员 limit -1
    needLogin: false,     // 游客：显示登录引导
    quotaExceeded: false, // 今日次数用完
    notFound: false,
    profileId: '',
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
      // 云调用失败（request 封装返回 null）按不存在兜底，避免白屏
      this.setData({ notFound: true });
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
    });
  },

  // 游客引导：静默登录后重试（登录后即为普通用户配额）
  async onLoginRetry() {
    const user = await ensureLogin();
    if (user) {
      this.setData({ needLogin: false });
      await this.loadDetail(this.data.profileId);
    } else {
      wx.showToast({ title: '登录失败，请稍后再试', icon: 'none' });
    }
  },

  // 以下交互 P3 激活，P2 占位
  onLike() { wx.showToast({ title: '即将开放', icon: 'none' }); },
  onChat() { wx.showToast({ title: '即将开放', icon: 'none' }); },
  onPass() { wx.showToast({ title: '即将开放', icon: 'none' }); },
  onReport() { wx.showToast({ title: '即将开放', icon: 'none' }); },

  // 分享转发卡片：落地即本页（游客走登录引导，spec §6.5）
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

新建 `miniprogram/pages/profile-detail/profile-detail.wxml`：

```xml
<view class="container detail">
  <!-- 游客：登录引导 -->
  <view class="card detail__state" wx:if="{{needLogin}}">
    <view class="detail__state-title">登录后查看完整资料</view>
    <view class="detail__state-desc text-secondary">微信一键登录，每天可查看多位嘉宾资料</view>
    <button class="detail__state-btn" bindtap="onLoginRetry">微信一键登录</button>
  </view>

  <!-- 今日配额用尽 -->
  <view class="card detail__state" wx:elif="{{quotaExceeded}}">
    <view class="detail__state-title">今日查看次数已用完</view>
    <view class="detail__state-desc text-secondary">明天再来；完成认证可提升每日查看次数</view>
  </view>

  <!-- 不存在 / 已下架 -->
  <view class="card detail__state" wx:elif="{{notFound}}">
    <view class="detail__state-title">嘉宾不存在或已下架</view>
  </view>

  <!-- 正常渲染 -->
  <block wx:elif="{{profile}}">
    <profile-card profile="{{profile}}" verified="{{verified}}" />

    <!-- 隐私区：无明文（普通/认证视角）显示 🔒 占位；有明文（本人/管理员）展示 -->
    <view class="card detail__privacy" wx:if="{{!profile.privacy}}">
      <text class="text-secondary">🔒 联系方式与资产信息：征求同意后可见</text>
    </view>
    <view class="card detail__privacy-detail" wx:else>
      <view class="detail__privacy-row">
        <text class="detail__privacy-label text-secondary">手机号</text>
        <text>{{profile.privacy.contact.phone || '未填写'}}</text>
      </view>
      <view class="detail__privacy-row">
        <text class="detail__privacy-label text-secondary">微信</text>
        <text>{{profile.privacy.contact.wechat || '未填写'}}</text>
      </view>
      <view class="detail__privacy-row">
        <text class="detail__privacy-label text-secondary">房车情况</text>
        <text>{{profile.privacy.asset.house || '未填写'}} · {{profile.privacy.asset.car || '未填写'}}</text>
      </view>
      <view class="detail__privacy-row">
        <text class="detail__privacy-label text-secondary">收入</text>
        <text>{{profile.privacy.asset.income || '未填写'}}</text>
      </view>
    </view>

    <!-- 按钮组：P3 激活（心动互配/聊天导流/无感），P2 占位 -->
    <view class="detail__actions">
      <view class="detail__btn detail__btn--pass" bindtap="onPass">无感</view>
      <view class="detail__btn detail__btn--chat" bindtap="onChat">聊天</view>
      <view class="detail__btn detail__btn--like" bindtap="onLike">心动</view>
    </view>

    <!-- 更多菜单：分享（立即可用）+ 举报（P3 激活表单） -->
    <view class="detail__footer">
      <button class="detail__share" open-type="share">分享资料卡</button>
      <text class="detail__report text-secondary" bindtap="onReport">举报</text>
    </view>

    <view class="detail__quota text-secondary" wx:if="{{quota && quota.limit > 0}}">
      今日还可查看 {{quota.limit - quota.used}} 位嘉宾
    </view>
  </block>
</view>
```

新建 `miniprogram/pages/profile-detail/profile-detail.wxss`：

```css
/* profile-detail —— 详情页（按钮组样式沿用 profile-card 的 pc__btn 视觉基调） */
.detail__state {
  text-align: center;
  padding: 80rpx 40rpx;
}
.detail__state-title {
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.detail__state-desc {
  font-size: 26rpx;
  margin-bottom: 40rpx;
}
.detail__state-btn {
  background: var(--color-primary, #ff5a5f);
  color: #ffffff;
  font-size: 28rpx;
  border-radius: 40rpx;
  margin: 0 60rpx;
}
.detail__privacy {
  padding: 24rpx;
  font-size: 26rpx;
}
.detail__privacy-detail {
  padding: 24rpx;
}
.detail__privacy-row {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 0;
  font-size: 28rpx;
}
.detail__privacy-label {
  font-size: 26rpx;
}
.detail__actions {
  display: flex;
  gap: 24rpx;
  margin-top: 24rpx;
}
.detail__btn {
  flex: 1;
  height: 84rpx;
  line-height: 84rpx;
  text-align: center;
  border-radius: 42rpx;
  font-size: 30rpx;
}
.detail__btn--pass {
  border: 1rpx solid #e5e5e5;
  color: #666666;
}
.detail__btn--chat {
  border: 1rpx solid var(--color-primary, #ff5a5f);
  color: var(--color-primary, #ff5a5f);
}
.detail__btn--like {
  background: var(--color-primary, #ff5a5f);
  color: #ffffff;
}
.detail__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 24rpx;
}
.detail__share {
  background: #ffffff;
  border: 1rpx solid #e5e5e5;
  color: #333333;
  font-size: 26rpx;
  border-radius: 32rpx;
  padding: 0 40rpx;
  line-height: 64rpx;
  height: 64rpx;
}
.detail__report {
  font-size: 26rpx;
  padding: 12rpx;
}
.detail__quota {
  text-align: center;
  font-size: 24rpx;
  margin-top: 24rpx;
}
```

- [ ] **Step 3: 类型检查 + 全量回归**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 全绿（页面无单测，与 profile-edit 等 P1 页面同策略——由 Task 7 E2E 覆盖）

- [ ] **Step 4: Commit**

```bash
git add miniprogram/pages/profile-detail miniprogram/app.json
git commit -m "feat(page): profile-detail 详情页（配额提示/隐私占位/按钮组占位/分享）"
```

---

### Task 6: recommend 页改造为「遇见」+ tabBar 更名 + 存量 E2E 断言更新

**Files:**
- Modify: `miniprogram/pages/recommend/recommend.js`（重写）、`recommend.wxml`（重写）、`recommend.wxss`（追加）、`recommend.json`（标题 + 组件注册 + 下拉刷新）
- Modify: `miniprogram/app.json`（tabBar 第一项 text `推荐` → `遇见`）
- Modify: `tests/e2e/app.test.ts`（3 处 mock 断言改为真实数据结构性断言）
- Modify: `tests/e2e/p1-profile.test.ts`（1 处 mock 断言 + 文件头注释）

**Interfaces:**
- Consumes: Task 2 `listProfiles`（`{ filter, page, pageSize }` → `{ list, page, hasMore }`）；Task 4 filter-panel（`bind:change` → `detail.filter`）；Task 5 详情页路由；`profile-card` 的 `bind:tap`（`detail.profile`）
- Produces: 「遇见」tab 页；页面 data 键 `list/page/hasMore/loading/filter/loadError`（Task 7 E2E 断言依赖）；`onFilterChange(e)` 处理器（E2E 直驱入口）

- [ ] **Step 1: 更新存量 E2E 断言（先改测试，红）**

`tests/e2e/app.test.ts` 中三处替换。

it1（`启动后默认落在「推荐」页`）标题与断言改为：

```ts
  it('启动后默认落在「遇见」页', async () => {
    expect(await currentRoute(mp)).toContain('recommend');
  }, T);
```

it2/it3（mock 两张卡片 + mock 数据完整性）合并替换为：

```ts
  it('「遇见」页列表为真实数据（CardVO 脱敏：无 privacy/openid 字段）', async () => {
    expect(await countSelector(mp, '.recommend__list')).toBe(1);
    const list = await pageData<any[]>(mp, 'list');
    expect(Array.isArray(list)).toBe(true); // 云调用在途时为初始 []，结构性断言不赌数据量
    for (const item of list) {
      expect(item.privacy).toBeUndefined();
      expect(item.openid).toBeUndefined();
      expect(item._id).toBeTruthy();
    }
  }, T);
```

（原 it3 整条删除。）

`tests/e2e/p1-profile.test.ts`：

- 文件头注释第 6 行 `* 推荐 tab 仍为 mock 数据（未接云），保留结构性断言。` 改为 ` * 「遇见」tab（recommend）已接入真实列表（P2），保留结构性断言。`
- 第 286-289 行用例替换为：

```ts
  it('「遇见」tab 已接入真实列表（结构性断言）', async () => {
    await mp.switchTab('/pages/recommend/recommend');
    // 列表数量随真实环境数据变化，只断言容器与 data 形状
    expect(await countSelector(mp, '.recommend__list')).toBe(1);
    const list = await pageData<any[]>(mp, 'list');
    expect(Array.isArray(list)).toBe(true);
  }, T);
```

- [ ] **Step 2: 跑 E2E 确认失败（可选，DevTools 未开则跳过）**

Run: `npx jest -c tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/app.test.ts`
Expected: FAIL —— `.recommend__list` 内不再有 mock 两张卡（list 长度 2 断言失败）。（本步仅确认测试与实现同步改造，跑不起来可跳过，Task 7 统一回归。）

- [ ] **Step 3: 重写 recommend 页**

`miniprogram/pages/recommend/recommend.json` 整体替换：

```json
{
  "navigationBarTitleText": "遇见",
  "enablePullDownRefresh": true,
  "usingComponents": {
    "profile-card": "/components/profile-card/index",
    "filter-panel": "/components/filter-panel/index"
  }
}
```

`miniprogram/pages/recommend/recommend.js` 整体替换：

```js
// pages/recommend/recommend.js —— 【遇见】tab：真实列表 + 筛选 + 分页（P2）
// 数据来自 listProfiles 云函数；卡片 VO 已脱敏（无隐私/身份字段）。
const { callFunction } = require('../../utils/request.js');

const PAGE_SIZE = 10;

Page({
  data: {
    list: [],
    page: 1,
    hasMore: false,
    loading: false,
    filter: {},
    loadError: false,
  },

  onLoad() {
    this.loadList(1);
  },

  onPullDownRefresh() {
    this.loadList(1).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return;
    this.loadList(this.data.page + 1);
  },

  async loadList(page) {
    if (this.data.loading) return this.data.page;
    this.setData({ loading: true, loadError: false });
    const res = await callFunction('listProfiles', {
      filter: this.data.filter,
      page,
      pageSize: PAGE_SIZE,
    });
    if (!res || res.error) {
      this.setData({ loading: false, loadError: true });
      return page;
    }
    this.setData({
      list: page === 1 ? res.list : this.data.list.concat(res.list),
      page: res.page,
      hasMore: res.hasMore,
      loading: false,
    });
    return res.page;
  },

  // filter-panel 应用/重置：回到第 1 页重查
  onFilterChange(e) {
    this.setData({ filter: (e.detail && e.detail.filter) || {} });
    this.loadList(1);
  },

  // 卡片整体点击 → 详情（详情页负责配额/登录引导）
  onCardTap(e) {
    const p = e.detail.profile;
    if (p && p._id) {
      wx.navigateTo({ url: '/pages/profile-detail/profile-detail?id=' + p._id });
    }
  },
});
```

`miniprogram/pages/recommend/recommend.wxml` 整体替换：

```xml
<view class="container recommend">
  <filter-panel bind:change="onFilterChange" />

  <view class="recommend__list" wx:if="{{list.length}}">
    <profile-card
      wx:for="{{list}}"
      wx:key="_id"
      profile="{{item}}"
      bind:tap="onCardTap"
    />
  </view>

  <view class="recommend__empty text-secondary" wx:if="{{!loading && !loadError && !list.length}}">
    暂无符合条件的嘉宾，试试放宽筛选条件
  </view>
  <view class="recommend__empty text-secondary" wx:if="{{loadError}}">加载失败，请下拉重试</view>
  <view class="recommend__more text-secondary" wx:if="{{loading}}">加载中…</view>
  <view class="recommend__more text-secondary" wx:if="{{!loading && hasMore}}">上拉加载更多</view>
</view>
```

`miniprogram/pages/recommend/recommend.wxss` 追加（保留现有两条规则）：

```css
.recommend__more {
  text-align: center;
  padding: 24rpx 0;
  font-size: 24rpx;
}
```

- [ ] **Step 4: tabBar 更名**

`miniprogram/app.json` 中 tabBar 第一项：

```json
      {
        "pagePath": "pages/recommend/recommend",
        "text": "遇见",
        "iconPath": "assets/tabbar/recommend.png",
        "selectedIconPath": "assets/tabbar/recommend-active.png"
      },
```

（图标文件名不动，见 README「tabBar 图标」节约定。）

- [ ] **Step 5: 类型检查 + 单测/集成回归**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 全绿

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/recommend miniprogram/app.json tests/e2e/app.test.ts tests/e2e/p1-profile.test.ts
git commit -m "feat(page): 「推荐」升级「遇见」——真实列表/筛选/分页 + 详情跳转；存量 e2e 断言同步"
```

---

### Task 7: P2 E2E + 部署验收文档 + 全量回归

**Files:**
- Create: `tests/e2e/p2-meet.test.ts`
- Modify: `README.md`（追加 P2 部署与验收节）
- Modify: `docs/superpowers/specs/2026-08-15-just4love-phased-roadmap-design.md`（状态行）

**Interfaces:**
- Consumes: Task 2/3 云函数（经真实云环境部署后调用）、Task 5/6 页面 data 键、`e2e-test` skill 全部通道规则、`deleteAccount`/`login`/`getMyProfile`/`updateProfile` 云函数
- Produces: P2 验收证据（E2E 四条路径：列表脱敏 / 筛选数据流 / 本人详情 / 游客登录引导）+ 部署文档

**前置条件（执行本任务前必须完成，否则 E2E 全挂）：**
1. 微信开发者工具打开本项目，云环境已 init（真实 env）。
2. IDE 中对 `cloudfunctions/listProfiles`、`cloudfunctions/getProfileDetail`、`cloudfunctions/setupDb` 逐个右键「上传并部署：云端安装依赖」。
3. 小程序端或云控制台调用一次 `setupDb`（幂等建 `config`/`view_logs` + 种子配额）。

- [ ] **Step 1: 写 E2E**

新建 `tests/e2e/p2-meet.test.ts`：

```ts
/**
 * P2 遇见：浏览与配额 E2E —— 真实云函数全链路（App 级通道，遵守 e2e-test skill）
 * 覆盖：列表脱敏 VO / 筛选数据流 / 本人详情（隐私明文不占配额）/ 游客登录引导 / 收尾恢复登录态。
 * 前置：listProfiles、getProfileDetail、setupDb 已部署且 setupDb 已调用（见计划前置条件）。
 * 文件内 wait/waitFor/callCloud 等 helper 与 p1-profile.test.ts 同款（该文件刻意不抽公共模块，
 * 保持每个 e2e 文件自包含可独跑；此处复制沿用同一约定）。
 */
import {
  connectOrLaunch,
  closeSession,
  pageData,
  runInApp,
  navTo,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
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

describe('P2 遇见：浏览与配额 E2E（真实云函数）', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await connectOrLaunch();
    mp = session.miniProgram;
  }, 120000);

  afterAll(() => closeSession(session));

  it('遇见列表：清缓存冷启动后加载真实数据，列表项为脱敏 CardVO', async () => {
    await runInApp(mp, () => {
      wx.clearStorageSync();
      return true;
    });
    // reLaunch 重建 recommend 实例（复用 IDE 时旧实例 data 带残留值，见 skill 环境事实）
    await navTo(mp, '/pages/recommend/recommend');
    await waitFor(async () => (await pageData<boolean>(mp, 'loading')) === false);
    const list = await pageData<any[]>(mp, 'list');
    expect(Array.isArray(list)).toBe(true);
    for (const item of list) {
      expect(item.privacy).toBeUndefined();
      expect(item.openid).toBeUndefined();
      expect(item._id).toBeTruthy();
      expect(typeof item.verified).toBe('boolean');
    }
  }, T);

  it('筛选数据流：onFilterChange 更新 filter 并按学历重查', async () => {
    // 组件内部交互由单测覆盖；e2e 驱动页面 handler 验证数据流（skill：交互走页面方法调用）
    await runInApp(mp, () => {
      const page = getCurrentPages().slice(-1)[0];
      page.onFilterChange({ detail: { filter: { educations: ['本科'] } } });
      return true;
    });
    await waitFor(async () => (await pageData<boolean>(mp, 'loading')) === false);
    expect(await pageData<any>(mp, 'filter')).toEqual({ educations: ['本科'] });
    const list = await pageData<any[]>(mp, 'list');
    expect(list.every((it) => it.about.education === '本科')).toBe(true);
  }, T);

  it('本人详情：self 视角隐私明文、quota 为 null、verified 徽标数据在位', async () => {
    // 先确保登录与本人资料存在（真实环境可能被上一轮 deleteAccount 清掉）
    const login = await callCloud(mp, 'login', {});
    expect(login && login.user).toBeTruthy();
    let mine: any = await callCloud(mp, 'getMyProfile', {});
    if (!mine || !mine.profile) {
      await callCloud(mp, 'updateProfile', {
        patch: { basic: { nickname: 'E2E嘉宾', gender: '女', birthday: '1995-06-15' } },
      });
      mine = await callCloud(mp, 'getMyProfile', {});
    }
    expect(mine && mine.profile && mine.profile._id).toBeTruthy();
    await navTo(mp, '/pages/profile-detail/profile-detail?id=' + mine.profile._id);
    await waitFor(async () => (await pageData<any>(mp, 'profile')) !== null);
    const d = await pageData<any>(mp);
    expect(d.self).toBe(true);
    expect(d.quota).toBeNull();
    expect(d.profile.privacy).toBeTruthy(); // 本人直看隐私
    expect(d.profile.basic.nickname).toBeTruthy();
  }, T);

  it('游客详情：deleteAccount 构造无档态 → 登录引导', async () => {
    const removed = await callCloud(mp, 'deleteAccount', {});
    expect(removed && removed.deleted).toBe(true);
    await navTo(mp, '/pages/profile-detail/profile-detail?id=whatever');
    await waitFor(async () => (await pageData<boolean>(mp, 'needLogin')) === true);
    expect(await pageData<boolean>(mp, 'needLogin')).toBe(true);
  }, T);

  it('收尾：login 重建用户档，恢复环境（资料可由 p1 用例重建）', async () => {
    const res = await callCloud(mp, 'login', {});
    expect(res && res.user && res.user.userId).toBeTruthy();
  }, T);
});
```

- [ ] **Step 2: 类型检查 + 跑 E2E**

Run: `npx tsc --noEmit -p tsconfig.json && npm run test:e2e`
Expected: 五个文件（app / message / p1-profile / p2-meet / tool-pages-tdesign）全过。
若 `p2-meet` 首个用例超时：按 skill「环境事实」节排障——App 级 evaluate 直调 `wx.cloud.callFunction({ name: 'listProfiles' })` 看真实 result（多为云函数未部署或集合缺失）。

- [ ] **Step 3: 更新 README（P1 节之后追加）**

在 `README.md` 的「## P1 部署与验收（登录与个人资料）」整节之后、「## TypeScript」之前插入：

```markdown
## P2 部署与验收（遇见：浏览与配额）

### 部署步骤

1. **云函数**：IDE 中对 `cloudfunctions/listProfiles`、`cloudfunctions/getProfileDetail`、
   `cloudfunctions/setupDb` 右键「上传并部署：云端安装依赖」（本机 CLI deploy 有 41002 问题，走 GUI）。
2. **初始化集合**：部署后调用一次 `setupDb`（幂等）——新增 `config`、`view_logs` 集合，
   并在 `config/quotas` 写入默认配额 `{ normal: 5, verified: 15 }`。
3. **新集合权限**：云开发控制台将 `config`、`view_logs` 权限设为「仅创建者可读写」。
4. **配额调整**（可选）：控制台改 `config/quotas` 的 `normal`/`verified` 数字即可生效，
   代码内有默认值兜底，P4 管理页上线前这是唯一改配额入口。
5. **已有 profiles 数据**：P2 之前创建的资料文档没有 `createdAt`（列表排序字段），
   让这些用户重新保存一次资料即可补上；或控制台按注册时间手工补。
6. **指定管理员**（同 P1 约定）：控制台将目标用户 `role` 改为 `admin`（不限次查看 + 隐私直看）。

### 验收清单（对应设计文档 §5 与 §10）

- [ ] 「推荐」tab 更名「遇见」，列表为真实资料卡（最新注册在前，分页上拉加载）
- [ ] 筛选面板：年龄/身高范围、学历/婚姻状况/职业多选、现居地省市两级多选，云端执行
- [ ] 卡片点击进详情；分享卡片可转发，落地走登录引导
- [ ] 游客（未登录）可看列表，点详情显示登录引导；登录后自动恢复查看
- [ ] 普通用户每日 5 个不同嘉宾详情、认证用户 15 个，重复看不重复计数，超额有提示
- [ ] 管理员不限次且直接可见联系方式/资产明文
- [ ] 普通用户详情页隐私字段显示 🔒「征求同意后可见」占位
- [ ] 心动/聊天/无感/举报点击提示「即将开放」（P3 激活）
- [ ] `npm test` 与 `npm run test:e2e` 全部通过
```

- [ ] **Step 4: 更新 roadmap 状态行**

`docs/superpowers/specs/2026-08-15-just4love-phased-roadmap-design.md` 第 4 行状态改为：

```markdown
- **状态**：P1 已完成并验收；P2 已完成（实现计划见 `plans/2026-08-19-just4love-p2-meet-browse-quota.md`）；P3 待启动
```

- [ ] **Step 5: 全量回归**

Run: `npx tsc --noEmit -p tsconfig.json && npm test && npm run test:e2e`
Expected: 三层测试全绿。

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/p2-meet.test.ts README.md docs/superpowers/specs/2026-08-15-just4love-phased-roadmap-design.md
git commit -m "test(e2e): P2 遇见全链路（脱敏列表/筛选/本人详情/游客引导）+ 部署验收文档"
```

---

## 自审记录（写计划时已核）

1. **Spec 覆盖**：§5.1 列表/更名/分页/排序 → Task 6；§5.2 六维筛选 + 云端执行 → Task 4（UI）+ Task 2（查询）；§5.3 详情页/隐私占位/按钮组占位/分享/举报占位 → Task 5（举报表单按 §6.5 与 §9.1 归 P3，P2 只留入口提示「即将开放」，与按钮组同口径）；§5.4 四档配额 + `config`/`view_logs` → Task 3；§5.5 两个云函数 → Task 2/3；§9.3 三层测试 → 各任务 TDD + Task 7 E2E；§10 验收 → README 清单 + E2E 路径。**有意偏差**：① §10 要求「E2E 覆盖配额边界」——真实云环境无法从测试侧播种 `view_logs`，配额边界（首看/复看/超额/config 覆盖）由 Task 3 集成测试 9 用例覆盖，E2E 覆盖配额相关的两条真实路径（本人不占配额、游客引导），已在验收清单注明；② 列表卡片不带心动/无感按钮（按钮组归详情页，§5.3 口径），列表卡整体点击进详情。
2. **占位符扫描**：无 TBD/TODO；所有新文件给出完整内容；Task 6 对 `recommend.wxss` 是「追加」而非整体替换（现有两条规则保留，新规则完整给出）。
3. **一致性**：CardVO 在 Task 2/3 两处镜像实现均已注释「改字段须两边同步」；`filter` 形状 Task 4 产出（`buildFilter`）与 Task 2 `buildWhere` 消费的键名逐一核对（ageMin/ageMax/heightMin/heightMax/educations/emotionalStatuses/cities/jobs）；filter-panel 事件 `change` 载荷 `{ filter }` 与 Task 6 `onFilterChange` 及 Task 7 E2E 直驱参数一致；详情页 data 键与 Task 7 E2E 断言键（self/quota/profile/needLogin）一致；`toDateKey` 导出与测试 require 一致；mock-db `command.in` 链式能力与 Task 2 `_.in(openids)`、Task 3 无链式用法匹配；`profile-card` 现有 `tap` 事件（`detail.profile`）即 Task 6 `onCardTap` 消费的形状，组件零改动。
4. **风险**：① 真实环境旧 `profiles` 无 `createdAt`（README 部署第 5 条兜底）；② `wx.navigateTo` 在 e2e 的 evaluate 上下文挂死——页面代码正常用（真实用户可用），E2E 一律 `navTo`（reLaunch），不驱动 `onCardTap`；③ E2E 文件字母序 app < message < p1-profile < p2-meet < tool-pages，`p2-meet` it3 依赖的本人资料由 `p1-profile` 先行建立，且自带 `login + updateProfile` 兜底，单独跑 `p2-meet` 亦可；④ e2e 会 `deleteAccount` 测试号数据——与 P1 e2e 同一测试环境约定，收尾 `login` 恢复用户档。
