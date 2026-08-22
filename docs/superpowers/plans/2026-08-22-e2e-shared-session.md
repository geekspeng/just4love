# E2E 共享 IDE 会话改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** E2E 全程（7 个套件）共享一个 automator 会话——一次建立、一次关闭，消除 per-file close→重连毒点与多套件重试循环互杀 IDE 的级联。

**Architecture:** 会话由第一个测试文件经 `getSharedSession()` 建立（复用既有冷启动加固逻辑），挂在 `process.__j4lE2eSession` 上跨文件共享（`--runInBand` 单进程、`process` 是同一真实对象；jest 每文件重建模块注册表故不能用模块级变量）；每个文件 beforeAll 探活复用，`teardown.js`（globalTeardown）统一 close 一次 + `cli quit` 一次。

**Tech Stack:** TypeScript + ts-jest（strict）、miniprogram-automator、jest projects + `--runInBand`、微信开发者工具 CLI。

**规格:** `docs/superpowers/specs/2026-08-22-e2e-shared-ide-session-design.md`（方案 A，已批准）

## Global Constraints

- 断言一律走 App 级 evaluate 通道（`currentRoute`/`pageData`/`countSelector`/`runInApp`/`navTo`）；**禁用** `page.$()`/`page.data()`/`mp.navigateTo` 等 Page 级协议（本机 DevTools 实测挂死，见 `.claude/skills/e2e-test`）。
- E2E 必须 `--runInBand`；本改造新增硬守卫（多 worker 直接报错）。
- 敏感值不入库：不改动 `miniprogram/app.js` 的 env 与 `project.config.json` 的 appid（提交 hook 已拦截）。
- 工作目录：worktree `.claude/worktrees/e2e-shared-session`（分支 `worktree-e2e-shared-session`，基线 `2a238f2` + 已承接的未提交加固 `1f50c6d`）。
- 验证策略说明（TDD 适配）：helpers 是 IDE 绑定的进程级设施，无单测桩可言；红绿验证在 Task 4 的双套件实跑——改造前两套件 = 两次独立连接生命周期，改造后 = 一次建立 + 一次复用 + 一次关闭（日志可观测）。类型与既有单测在每个任务内即时验证。

---

### Task 1: helpers.ts — getSharedSession 共享会话核心

**Files:**
- Modify: `tests/e2e/helpers.ts`

**Interfaces:**
- Produces: `getSharedSession(): Promise<ConnectedSession>`（导出）；`connectOrLaunch` 不再导出（收为内部）；`closeSession` 删除。`ConnectedSession`/`MiniProgram` 及断言原语不变（后续任务依赖 `getSharedSession` 这一名字）。

- [ ] **Step 1: 加 process stash 全局类型声明**

在 `tests/e2e/helpers.ts` 的 `export interface ConnectedSession { ... }` 定义之后插入：

```ts
// 共享会话 stash：--runInBand 下 jest 每文件重建模块注册表（模块级变量跨不了文件），
// 但 process 是同一真实对象——挂在 process 上即可跨测试文件共享（teardown.js 也读它）
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Process {
      __j4lE2eSession?: ConnectedSession;
    }
  }
}
```

- [ ] **Step 2: 删除 closeSession，connectOrLaunch 收为内部**

删除整个 `closeSession` 函数及其文档注释块（约 172–182 行，含「会话清理（每个测试文件的 afterAll 调用）」注释——其知识已迁移到 teardown.js 与 getSharedSession 注释）。将 `export async function connectOrLaunch(` 改为 `async function connectOrLaunch(`（去掉 export）。其余逻辑（协议探测/launch 竞态兜底/3 次重试）原样不动。

- [ ] **Step 3: 新增 getSharedSession（放原 closeSession 位置）**

```ts
/**
 * 获取全程共享的自动化会话（每个测试文件的 beforeAll 调；teardown.js 统一关闭）：
 *   - 首个套件建立会话（launch/connect，含冷启动竞态兜底）挂到 process；
 *   - 后续套件探活通过直接复用——全程一次建立、一次关闭。
 * 为何不再 per-file close：实测 close→重连会把自动化服务打进「端口在、连接即断」坏态；
 * 且共享后会话永远单所有者，重试清理里的 cli quit 不会再误杀邻居套件的 IDE。
 * 会话中途死掉（如 Connection closed）→ 探活失败自动重建，不影响后续套件。
 * 注意：miniProgram.close() 只结束自动化会话不杀 IDE 进程，IDE 退出由
 * teardown.js 的 cli quit 统一做一次（勿挪回任何测试文件的 afterAll）。
 */
export async function getSharedSession(): Promise<ConnectedSession> {
  if (process.env.JEST_WORKER_ID) {
    throw new Error(
      'E2E 须 --runInBand 运行：共享会话挂在 process 上，多 worker 会各持一份并争抢自动化端口。请用 npm run test:e2e'
    );
  }
  const stashed = process.__j4lE2eSession;
  if (stashed) {
    try {
      const pong = await Promise.race([
        stashed.miniProgram.evaluate(() => 1 + 1),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('共享会话探活超时')), 5000)
        ),
      ]);
      if (pong === 2) {
        console.log('[e2e] 复用共享会话');
        return stashed;
      }
      throw new Error('探活响应异常: ' + String(pong));
    } catch (e) {
      console.warn(`[e2e] 共享会话已失活（${String(e).slice(0, 80)}），重建`);
      try { await stashed.miniProgram.close(); } catch { /* 死会话，close 失败忽略 */ }
      delete process.__j4lE2eSession;
    }
  }
  const session = await connectOrLaunch();
  process.__j4lE2eSession = session;
  console.log('[e2e] 新建会话（全程共享，teardown 统一关闭）');
  return session;
}
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: **helpers.ts 自身 0 错误**；7 个测试文件各报 `connectOrLaunch`/`closeSession` 不存在（Task 2 消除，属预期中间态，不阻塞）。若 helpers.ts 报错，修复后才能进 Task 2。

- [ ] **Step 5: Commit（不拆分，与 Task 2 同属一个可编译交付物，先暂存不提交）**

本任务单独不可编译，与 Task 2 合并为一次提交（见 Task 2 Step 5）。

---

### Task 2: 7 个测试文件切换 + teardown.js 唯一收口

**Files:**
- Modify: `tests/e2e/app.test.ts`、`message.test.ts`、`p1-profile.test.ts`、`p2-meet.test.ts`、`p3-interact.test.ts`、`p4-verify.test.ts`、`tool-pages-tdesign.test.ts`
- Modify: `tests/e2e/teardown.js`

**Interfaces:**
- Consumes: Task 1 的 `getSharedSession(): Promise<ConnectedSession>`；teardown.js 消费 `process.__j4lE2eSession`（duck-typing，无类型依赖）。

- [ ] **Step 1: 改多行 import 形态的 5 个文件（app/message/p1/p2/tool-pages）**

每个文件相同三处：

1. import 块中删除 `connectOrLaunch,` 行与 `closeSession,` 行，加入 `getSharedSession,`（保持字母序插入位置即可）。例（app.test.ts）：

```ts
import {
  getSharedSession,
  currentRoute,
  pageData,
  countSelector,
  runInApp,
  navTo,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
} from './helpers';
```

（各文件原有其余导入名不变，仅做上述三行替换。）

2. `beforeAll` 内：`session = await connectOrLaunch();` → `session = await getSharedSession();`

3. 删除 `afterAll(() => closeSession(session));` 行（含其上方空行保留一行即可）。

- [ ] **Step 2: 改单行 import 形态的 2 个文件（p3/p4）**

1. `import { connectOrLaunch, closeSession, pageData, runInApp, navTo, TEST_TIMEOUT as T, MiniProgram, ConnectedSession, } from './helpers';` →

```ts
import {
  getSharedSession, pageData, runInApp, navTo,
  TEST_TIMEOUT as T, MiniProgram, ConnectedSession,
} from './helpers';
```

2. `session = await connectOrLaunch();` → `session = await getSharedSession();`
3. 删除 `afterAll(() => closeSession(session));` 行。
4. 文件头注释 `* helper 与 p1/p2(/p3) 文件同款（file-local 约定，保持各文件自包含可独跑）。` → `* 会话走 helpers.getSharedSession() 全程共享（一次建立/一次关闭，teardown 统一收口）；本文件用例仍可单独指定运行。`

（p2-meet.test.ts 若头注释有类似 file-local 表述，同样替换。）

- [ ] **Step 3: teardown.js 改为「关会话一次 + 退 IDE 一次」**

整文件替换为：

```js
// E2E globalTeardown：整套结束后关闭共享会话并退出微信开发者工具（各一次）。
//
// 会话由第一个测试文件经 helpers.getSharedSession() 建立并挂到 process.__j4lE2eSession
// （--runInBand 单进程跨文件共享）；per-file afterAll 不再关闭——实测 close→重连会把
// 自动化服务打进「端口在、连接即断」的坏态，且多套件重试循环并发 quit 会互杀 IDE。
// IDE 退出只能在这里做一次：前一个文件 quit 后，后一个文件 launch 会撞上正在退出的实例而挂死（实测）。
//
// 注意：若你正手动开着 DevTools 调试，跑 e2e 后它也会被关闭。
const { execFile } = require('child_process');
const { existsSync } = require('fs');

module.exports = async function teardown() {
  // 1) 关闭共享自动化会话（一次）
  const session = process.__j4lE2eSession;
  if (session && session.miniProgram && typeof session.miniProgram.close === 'function') {
    try {
      await session.miniProgram.close();
    } catch (e) {
      console.warn(`[e2e] 关闭共享会话失败（忽略）: ${e && e.message}`);
    }
    delete process.__j4lE2eSession;
  }
  // 2) 退出微信开发者工具（一次）。CLI 路径与 tests/e2e.config.ts 保持一致（plain JS 无法 require TS 配置）。
  const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
  if (!existsSync(cliPath)) return; // 无 CLI 的环境（CI）直接跳过
  await new Promise((resolve) => {
    execFile(cliPath, ['quit'], (err) => {
      if (err) console.warn(`[e2e] 退出微信开发者工具失败（可手动关闭）: ${err.message}`);
      resolve();
    });
  });
};
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 错误。

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/
git commit -m "refactor(e2e): 全程共享 IDE 会话——一次建立/一次关闭，teardown 统一收口

- helpers: getSharedSession()（process 级 stash + 探活复用/失活重建 + runInBand 守卫），
  connectOrLaunch 收为内部，删除 closeSession（close→重连实测毒点）
- 7 个测试文件 beforeAll 切换，移除 per-file afterAll 关闭
- teardown.js: 先关共享会话再 cli quit（各一次）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: skill 文档/模板同步 + caffeinate 防休眠

**Files:**
- Modify: `.claude/skills/e2e-test/SKILL.md`
- Modify: `.claude/skills/e2e-test/assets/template.test.ts`
- Modify: `package.json`（scripts.test:e2e）
- Modify: `README.md`（E2E 运行步骤）

**Interfaces:**
- Consumes: `getSharedSession`（文档示例与模板必须与 Task 1/2 的实际 API 一致，防未来按旧模板生成 per-file close 模式）。

- [ ] **Step 1: SKILL.md 三处更新**

1. 「生成步骤」第 1 条 helpers 说明：`connectOrLaunch / closeSession / 断言原语` 改为 `getSharedSession（全程共享会话）/ 断言原语`。
2. 「文件骨架」代码块替换为：

```ts
import {
  getSharedSession, currentRoute, pageData,
  countSelector, runInApp, TEST_TIMEOUT as T,
  MiniProgram, ConnectedSession,
} from './helpers';

describe('<功能> E2E', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await getSharedSession();
    mp = session.miniProgram;
  }, 120000);

  // 注意：不要加 afterAll 关闭会话——全程共享，teardown 统一收口（一次建立/一次关闭）

  it('...', async () => { /* ... */ }, T);
});
```

3. 「环境事实」中这条 bullet：

`- 测试跑完会自动退出微信开发者工具：per-file 的 closeSession 只关自动化会话（miniProgram.close() 不杀 IDE 进程），整套结束由 jest globalTeardown（tests/e2e/teardown.js 调 cli quit）统一退出。勿把 quit 挪进测试文件的 afterAll——下一个文件的 launch 会撞上正在退出的 IDE 挂死（实测）`

替换为：

`- 会话全程共享：各文件 beforeAll 用 getSharedSession()（首个文件建立、后续复用，失活自动重建）；**勿在测试文件里 close 会话或 quit IDE**——close→重连实测会把自动化服务打进「端口在、连接即断」坏态，quit 会使下个文件 launch 撞上正在退出的 IDE。关闭会话与退出 IDE 都由 jest globalTeardown（teardown.js）统一做一次`

- [ ] **Step 2: template.test.ts 同步**

import 块改为 `getSharedSession,`（删 `connectOrLaunch,`、`closeSession,`）；`beforeAll` 内改 `session = await getSharedSession();`；删除 `afterAll(() => closeSession(session));` 行，原位置加注释：

```ts
  // 不要在此 close 会话：全程共享（getSharedSession），teardown 统一一次关闭/退出
```

- [ ] **Step 3: package.json 加 caffeinate**

`"test:e2e": "jest --config tests/jest.config.js --selectProjects e2e --runInBand",` →

```json
    "test:e2e": "caffeinate -i jest --config tests/jest.config.js --selectProjects e2e --runInBand",
```

（macOS 防休眠——8/21 通宵全量即被休眠打死通道；`-i` 阻止系统空闲休眠。）

- [ ] **Step 4: README E2E 运行步骤补一句**

第 4 步代码块后追加一行：

```markdown
> macOS 下脚本经 `caffeinate -i` 包装以防长跑（约 1–2 小时）中途休眠打断 IDE 自动化通道；非 macOS 请去掉该前缀直接跑 jest。
```

- [ ] **Step 5: 验证 + Commit**

Run: `npm test`
Expected: unit + integration 全绿（不受影响）。

```bash
git add .claude/skills/e2e-test/ package.json README.md
git commit -m "docs(e2e): skill/模板同步共享会话用法 + test:e2e 包 caffeinate 防休眠

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 双套件实跑验证（真正的红绿门）

**Files:**
- 无新改动（验证任务；若 R1 触发回退则按规格改方案 B 并重新过本任务）

**Interfaces:**
- Consumes: Task 1–3 的完整链路（共享会话 + caffeinate 不在本任务路径上——直接调 jest，等效验证）。

前置确认：本机 9420 端口空闲（`lsof -i :9420` 或 node 探测）；若用户手动开着 DevTools，先提醒会被接管并在结束时退出。

- [ ] **Step 1: 双套件一次 jest 调用（app + message）**

```bash
npx jest --config tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/app.test.ts tests/e2e/message.test.ts
```

Expected（全部满足才算过）：
1. 两套件 `Tests:` 全绿（app 6/6、message 3/3——以当前用例数为准）；
2. stdout 恰好一次 `[e2e] 新建会话（全程共享，teardown 统一关闭）`（app 先跑时出现在 app 的 console 段）与一次 `[e2e] 复用共享会话`（message 段）；
3. 无 `[e2e] 共享会话已失活` 告警（跨 jest 沙箱共享成立的直接证据，即规格 R1 验证）；
4. 结尾无 `Cannot log after tests are done` / `require after Jest environment torn down`（僵尸循环消失）；
5. DevTools 进程：运行期间只冷启动一次；结束后 `pgrep -fl wechatwebdevtools` 为空（teardown quit 生效）。

- [ ] **Step 2: 若 Step 1 第 3 点失败（R1 跨沙箱共享不成立）**

按规格回退方案 B：helpers 不共享对象、每文件 `automator.connect`（首个文件仍走 launch）、永不 per-file close、teardown 仅 `cli quit`。改完后重跑 Step 1，预期只剩「复用/新建」日志语义改为「连接共享 IDE」。在最终报告注明回退原因。

- [ ] **Step 3: 收尾提交（如有回退改动）+ 报告**

```bash
git status --short   # 应干净；有回退改动则 git add -A && git commit -m "fix(e2e): R1 回退方案 B（每文件 connect 不 close）"
```

全量 7 套件（约 1–2 小时，`npm run test:e2e`，caffeinate 加持）留给用户择时执行——本计划不包含。
