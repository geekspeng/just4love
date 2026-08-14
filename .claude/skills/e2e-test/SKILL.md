---
name: e2e-test
description: 为 just4love 微信小程序的新功能生成 E2E 测试代码。使用本 skill 当用户要求写 E2E 测试、端到端测试、自动化测试、miniprogram-automator 测试，或新增页面/组件/云函数后需要配套 E2E 验证时。即使用户只说"给这个页面加个测试"，只要测试要驱动微信开发者工具运行小程序，就用本 skill。
---

# E2E 测试生成（just4love）

为本项目新功能生成可靠的 E2E 测试。核心技术约束来自 2026-08 实测：**本机 DevTools 的 Page 级协议挂死，必须走 App 级 evaluate 通道**。勿凭官方示例直觉写 `page.$()`——那会在这台机器上无限挂起。

## 必须遵守的通道规则

**可用（App 级，全部实测通过）：**
- `miniProgram.evaluate(fn, ...args)` — 在小程序上下文执行任意代码
- `miniProgram.switchTab / reLaunch / navigateTo / navigateBack` — 导航
- `miniProgram.pageStack / callWxMethod / systemInfo`

**禁用（Page 级渲染协议，本机挂死，实测确认）：**
- `page.$() / page.$$()` — 元素查询，永不返回
- `page.data() / page.setData()` — 页面数据，永不返回
- `element.text() / element.tagName / element.tap()` — 元素操作，永不返回
- `page.waitFor(selector)` — 内部用 `$$`，同样挂

**为什么**：DevTools 2.01.2510290（内核 nwjs 91）上 `Page.getElement` 等协议不响应。`App.*` 协议正常。断言能力等价——`evaluate` 内可用完整的小程序 API（`getCurrentPages`、`wx.createSelectorQuery`）。

## 生成步骤

1. **读基础设施**（勿重复造轮子）：
   - `tests/e2e/helpers.ts` — `connectOrLaunch` / `closeSession` / 断言原语（`currentRoute` / `pageData` / `countSelector` / `runInApp`）/ `TEST_TIMEOUT`
   - `tests/e2e/app-globals.d.ts` — `getCurrentPages`/`wx` 类型声明（自动生效）
   - `tests/e2e/app.test.ts` — 结构范例

2. **新文件命名**：`tests/e2e/<feature>.test.ts`（jest 配置的 testMatch 是 `tests/e2e/**/*.test.ts`，自动被发现）

3. **文件骨架**（从 `assets/template.test.ts` 复制后填充）：
   ```ts
   import {
     connectOrLaunch, closeSession, currentRoute, pageData,
     countSelector, runInApp, TEST_TIMEOUT as T,
     MiniProgram, ConnectedSession,
   } from './helpers';

   describe('<功能> E2E', () => {
     let session: ConnectedSession;
     let mp: MiniProgram;

     beforeAll(async () => {
       session = await connectOrLaunch();
       mp = session.miniProgram;
     }, 120000);

     afterAll(() => closeSession(session));

     it('...', async () => { /* ... */ }, T);
   });
   ```

4. **断言写法**（按需选用）：
   - 路由：`expect(await currentRoute(mp)).toContain('xxx')`
   - 页面数据：`const d = await pageData<T>(mp, 'list'); expect(d[0].nickname).toBe('小鱼')`
   - 元素存在性/数量：`expect(await countSelector(mp, '.some-class')).toBe(1)`（页面级选择器；**跨自定义组件边界的选择器查不到**，组件内部 class 用页面 data 断言代替）
   - 交互：`runInApp(mp, () => { page.onXxx({...}); return true })`（直接调页面方法，验证不抛错）
   - 导航后断言：`await mp.switchTab('/pages/xxx/xxx')` 或 `await mp.reLaunch(...)`，然后走上面原语

5. **每个 `it` 必须显式传 `T`（30s）**。jest 默认 5s，DevTools 通信慢必超时。（jest.config 里的 `testTimeout` 实测不生效，别依赖它）

6. **验证**：`npm run test:e2e`（先 `npx tsc --noEmit -p tsconfig.json` 查类型）。测试自动连接已运行的 DevTools 实例，没有则自动 launch。

## 环境事实（排障时参考）

- DevTools CLI：`/Applications/wechatwebdevtools.app/Contents/MacOS/cli`（`tests/e2e.config.ts` 可改）
- 自动化端口 9420；若被监听则 connect，否则 launch（helpers 已处理）
- 「服务端口」须开启：DevTools → 设置 → 安全设置 → 服务端口。CLI 会交互式问 "Enable IDE Service (y/N)"，卡住多半是这个
- TypeScript 锁定 5.9.x：ts-jest 不支持 TS 7（会报 "does not expose the JavaScript compiler API"）
- 评估回调里只能返回**可序列化**值；返回页面对象等会得到 `TypeError: received is not iterable`
- `npm test`（unit+integration）不含 e2e；e2e 需 DevTools，独立跑 `npm run test:e2e`
- 测试跑完会自动退出微信开发者工具：per-file 的 `closeSession` 只关自动化会话（`miniProgram.close()` 不杀 IDE 进程），整套结束由 jest globalTeardown（`tests/e2e/teardown.js` 调 `cli quit`）统一退出。**勿把 quit 挪进测试文件的 afterAll**——下一个文件的 launch 会撞上正在退出的 IDE 挂死（实测）

## 模板

完整模板在 `assets/template.test.ts`（含注释说明每个断言原语的适用场景）。
