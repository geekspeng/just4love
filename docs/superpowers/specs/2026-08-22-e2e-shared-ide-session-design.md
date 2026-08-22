# E2E 共享 IDE 会话设计（全程一次建立、一次关闭）

日期：2026-08-22
状态：已获用户批准（方案 A，含 caffeinate）

## 背景与问题

2026-08-21/22 通宵全量 E2E（7 套件，`--runInBand`）33 个用例全败，无一败在业务断言，
全部败在会话层。机制（见记忆 `e2e-ide-channel-cascade`）：

1. 现状是**每套件一个 automator 会话生命周期**：`beforeAll connectOrLaunch()`（冷启动时
   launch IDE + 新建 websocket 会话）→ `afterAll closeSession()`（关会话）。helpers 实测
   注释已记录毒点：*close 后重连会把自动化服务打进「端口在、连接即断」的坏态*。
2. jest hook 超时**不取消**底层 promise：beforeAll 判死后 connectOrLaunch 的 3 次重试循环
   作为僵尸继续跑，每轮失败执行 `cli quit`，把下一个套件刚 launch 的 IDE 杀掉（日志铁证：
   run 结束后还在 flush 的 "Cannot log after tests are done" 来自 4 个套件）。
3. 2 小时长跑中途 Mac 休眠（job 因此 blocked），醒后自动化通道半死。

用户诉求：**整个测试过程 DevTools/会话只打开和关闭一次。**

## 目标

- 全程（所有 7 个 e2e 套件）共享一个 automator 会话：第一个套件建立，最后一个套件用完，
  `globalTeardown` 统一关闭会话 + `cli quit` 退 IDE（各一次）。
- 消除 per-file close→重连毒点；消除多套件重试循环并发 `quit` 的竞争（会话永远单所有者）。
- 未来按 skill 模板生成的新测试文件自动继承共享模式（同步 skill 文档与模板）。

## 非目标

- 不改测试用例本身（断言、setupDb 云调用等）。
- 不解决 Page 级协议挂死问题（App 级 evaluate 通道约束不变，见 `.claude/skills/e2e-test`）。
- 不引入多 worker 并行（维持 `--runInBand`，并加守卫）。

## 方案（已批准的 A）

### helpers.ts

- 新增 `getSharedSession(): Promise<ConnectedSession>`：
  - 读 `process.__j4lE2eSession`（runInBand 单进程内跨测试文件存活；jest 每文件重建模块
    注册表，但 `process` 是同一真实对象）；
  - 存在 → 探活（`evaluate(() => 1 + 1)`，5s 短超时）通过 → 直接复用，日志
    `[e2e] 复用共享会话`；
  - 不存在或探活失败 → 走现有加固版建立逻辑（launch / 协议级就绪探测 / 3 次重试，
    原样保留）→ 写入 stash → 返回，日志 `[e2e] 新建会话`；旧 stash 若为死会话先防御性
    close（异常吞掉）。
- `connectOrLaunch` 收为模块内部函数，不再导出；`closeSession` 删除导出。
- runInBand 守卫：非 in-band 即 throw，提示用 `npm run test:e2e`（防多 worker 各自 launch
  抢 9420 端口）。判据用 `process.argv` 是否含 `--runInBand`/`-i`——实测 `JEST_WORKER_ID`
  在 in-band 下也为 `'1'`，不能用作判据（2026-08-22 双套件验证时发现并修正）。

### teardown.js（全局唯一收口）

- 先读 `process.__j4lE2eSession`，调 `miniProgram.close()` 关共享会话（duck-typing，plain JS）；
- 再执行现有 `cli quit` 退 IDE。仍是全程各一次。

### 7 个测试文件

- `beforeAll`：`connectOrLaunch()` → `getSharedSession()`（一行改动）；
- 删除 `afterAll(() => closeSession(session))` 行；
- `ConnectedSession` 类型与 `session.miniProgram` 用法不变。

### skill 文档同步（防回归关键）

- `.claude/skills/e2e-test/SKILL.md`：文件骨架、「环境事实」中会话生命周期描述改为
  `getSharedSession` / 删除 closeSession；
- `assets/template.test.ts` 模板同步。

### caffeinate

- `package.json`：`"test:e2e": "caffeinate -i jest --config tests/jest.config.js --selectProjects e2e --runInBand"`
  （macOS 防休眠；本项目 CLI 路径本就 macOS-only。非 macOS 环境无 caffeinate 命令会报错，
  README 注明）。

## 错误处理

- 共享会话中途死亡（如 Connection closed）→ 下个套件 `getSharedSession()` 探活失败自动
  重建；单所有者下重建路径里的 `cli quit` 不再有邻居可误杀。
- 重建失败 → 该套件按现有机制失败，不影响下个套件再次尝试。
- teardown 时 stash 不存在（如全部套件跳过）→ 跳过 close，仅 `cli quit`。

## 测试与验证

1. `npx tsc --noEmit`（类型）；
2. `npm test`（unit/integration 不受影响）；
3. 双套件一次 jest 调用（app + message）实跑：核对日志序列
   `新建会话 ×1 → 复用共享会话 ×1 → teardown 关闭`，DevTools 冷启动仅一次、末尾退出一次，
   两套件全绿（当前 9420 端口干净，正好冷启动实测跨沙箱共享可行性——若失败回退方案 B：
   每套件 connect 且永不 close）；
4. 全量 7 套件（约 2h，caffeinate 加持）由用户择时执行。

## 风险

- R1 共享会话对象跨 jest 沙箱存续（socket/timer 为真实 node 资源，理论可行，双套件实测）；
  失败回退方案 B。
- R2 用户手动开着 DevTools 调试时跑 e2e：行为与现状一致（被接管，结束时被 quit）。
- R3 休眠：caffeinate 缓解；若仍发生（强制合盖），下个套件探活重建兜底。

## 实施中发现并修复的协议级根因（2026-08-22 双套件实测）

IDE 2.02.2608040 的自动化端点 `Tool.getInfo` 返回 `{version:"2.02.x"}` 而非旧版的
`{SDKVersion}`：miniprogram-automator@0.12.1 的 `checkVersion` 对 `undefined` 调
`split` 崩（**connect 与 launch 均撞此**，此前「connect 不做 checkVersion」的假设不成立），
`probeIdeReady` 也因找不到 `SDKVersion` 恒失败——这正是 8/22 全天「端口在听但握手全挂」的
直接原因（叠加前晚的未登录态）。修复：helpers 模块加载时把
`MiniProgram.prototype.checkVersion` 原型级置空（该检查只是「运行时 SDK≥2.7.3」的客户端
守卫，本机恒满足），`probeIdeReady` 兼容 `SDKVersion || version`。
独立探针验证：补丁前 `CONNECT_FAIL: TypeError ... split`，补丁后 `evaluate(1+1)===2`。

## 验证结论（Task 4 红绿门）

- 热路径：app+message 双套件 9/9 全绿，总耗时 16.3s；结束后 9420 关闭、无残留连接、无
  僵尸告警（改造前同环境 120s hook 超时全灭）。
- 冷路径（IDE 被 teardown 关闭后重跑）：9/9 全绿；app 22.2s（launch+建立+6 用例）、
  message 3.4s（纯复用+3 用例）——单套件若另建连接仅握手即需 3–5s，3.4s 只可能是
  stash 复用，R1（跨 jest 沙箱共享会话）实测成立。
- 生命周期 console 日志（新建/复用）在本机 jest 管道输出中被吞（与 PASS 行丢失同象），
  以计时证据替代；全量跑在 TTY 下可直接观察。

## 携带的既有未提交改动

主工作区有两处上个会话的未提交改动，为本设计的基础，随本分支一起提交：
- `tests/e2e/helpers.ts`：冷启动加固（协议级就绪探测 + 3 次重试 + quit 清理）；
- `tests/e2e/app.test.ts`：mine 菜单 6→8 断言（P4 角色 menu）。
