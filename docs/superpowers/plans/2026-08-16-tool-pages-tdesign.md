# 工具页接入 TDesign 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 6 个工具页（settings、message、tags-edit、album-edit、story-edit、profile-edit）接入 TDesign 小程序组件库，观感统一，业务逻辑 js 零改动。

**Architecture:** 先装依赖并构建 npm、挂全局主题变量（Task 1），再逐页替换 wxml/wxss/页面 json（Task 2-7），最后全量回归与体积复查（Task 8）。TDesign 仅用于展示/布局类组件（cell、tag、icon、image、avatar、badge、empty、button）；picker/input/textarea/open-type 按钮保留原生以保证微信能力与 js 零改动。

**Tech Stack:** 微信原生小程序（WXML/WXSS）、tdesign-miniprogram（npm，最低基础库 ^2.6.5）、jest + miniprogram-automator（e2e）。

**Spec:** `docs/superpowers/specs/2026-08-16-tool-pages-tdesign-design.md`（含 2026-08-16 修订）

## Global Constraints

- 主题色 `#FF5A5F`（`--color-primary`）不变；TDesign 变量映射到 `--color-*`，单一事实源在 `miniprogram/app.wxss`
- **业务逻辑 js 零改动**：只动 wxml / wxss / 页面 json；Task 1 另动 `miniprogram/app.json`、`miniprogram/app.wxss`、新建 `miniprogram/package.json`
- 保留原生（不用 TDesign 对应组件）：`<input type="nickname">`、`<textarea>`、`<picker>`、`<button open-type="...">`；不引入 t-picker / t-input / t-textarea / t-upload
- **事件处理器名与页面级 BEM class 一律不变**（如 `.message__item`、`onInput`、`onRegion`）——现有 e2e 断言依赖二者
- `miniprogram_npm/` 构建产物提交入库；主包体积必须 < 2MB
- e2e 前置：先读 `.claude/skills/e2e-test/SKILL.md`。只走 App 级通道（`evaluate`/`switchTab`/`navTo`），**禁用** `page.$()`/`page.data()`/`element.*`/`mp.navigateTo`；每个 `it` 显式传 `TEST_TIMEOUT`；tab 页用 `switchTab`，非 tab 页用 `navTo`
- 敏感值约定（CLAUDE.md）：**不动** `miniprogram/app.js` 与 `project.config.json`；不 `git add -f`；若提交被 hook 拦截，`git restore --staged miniprogram/app.js project.config.json` 后重新提交
- 组件属性名以官方文档为准核对后再落盘：`https://tdesign.tencent.com/miniprogram/components/<组件名>`（cell / cell-group / check-tag / tag / icon / avatar / badge / empty / button / image）
- 提交信息用中文 conventional commits；每 Task 一次提交

---

### Task 1: 安装 TDesign、构建 npm、全局主题接入

**Files:**
- Create: `miniprogram/package.json`、`miniprogram/package-lock.json`（npm 生成）、`miniprogram/miniprogram_npm/`（构建生成）
- Modify: `miniprogram/app.json`、`miniprogram/app.wxss`

**Interfaces:**
- Consumes: 无
- Produces: `tdesign-miniprogram/<组件名>/<组件名>` 的组件注册路径约定（后续所有页面 json 使用）；`miniprogram_npm/tdesign-miniprogram/` 构建产物

- [ ] **Step 1: 核对基础库版本**

微信开发者工具 → 详情 → 本地设置 → 调试基础库。TDesign README 标注最低基础库 `^2.6.5`，当前值低于它则切换到最新稳定版再继续。

- [ ] **Step 2: 新建 miniprogram/package.json**

```json
{
  "name": "just4love-miniprogram",
  "version": "0.1.0",
  "private": true,
  "description": "just4love 小程序侧 npm 依赖（TDesign 组件库）",
  "dependencies": {}
}
```

- [ ] **Step 3: 安装依赖**

```bash
cd /Users/geekspeng/OpenSource/GitHub/just4love/miniprogram && npm install tdesign-miniprogram --save
```

记录实际安装的版本号（后面主包体积若超标，按需引入时要用）。

- [ ] **Step 4: 构建 npm**

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli build-npm --project /Users/geekspeng/OpenSource/GitHub/just4love
```

若 CLI 卡在服务端口（参见 `.claude/skills/e2e-test/SKILL.md` 环境事实），改用 GUI：微信开发者工具 → 工具 → 构建 npm。
验收：`miniprogram/miniprogram_npm/tdesign-miniprogram/` 目录存在。

- [ ] **Step 5: app.json 开启按需注入（2026-08-16 用户裁定作废）**

~~原计划追加 `"lazyCodeLoading": "requiredComponents"`~~。实测该配置与 miniprogram-automator e2e 存在时序冲突（加了必挂「切回推荐 tab」用例），用户裁定移除（commit c398826）。本步骤不执行。

- [ ] **Step 6: app.wxss 挂 TDesign 主题映射**

在 `page { ... }` 规则内追加（保持在现有 `--color-*` 定义之后）：

```css
  /* TDesign 主题映射：单一事实源仍是上方 --color-* */
  --td-brand-color: var(--color-primary);
  --td-radius-large: var(--radius-card);
```

- [ ] **Step 7: 单测回归**

Run: `cd /Users/geekspeng/OpenSource/GitHub/just4love && npm test`
Expected: 全绿（js 零改动，不应有变化）

- [ ] **Step 8: e2e 冒烟**

Run: `npx jest -c tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/app.test.ts`
Expected: 全过（确认构建产物与 lazyCodeLoading 没破坏现有页面）

- [ ] **Step 9: 记录主包体积**

微信开发者工具 → 详情 → 基本信息 → 代码包体积。记录主包数值；**必须 < 2MB**，超出则停下，向用户报告并改议按需引入方案。

- [ ] **Step 10: Commit**

```bash
git add miniprogram/package.json miniprogram/package-lock.json miniprogram/miniprogram_npm miniprogram/app.json miniprogram/app.wxss
git commit -m "chore(miniprogram): 接入 TDesign 组件库与全局主题映射"
```

---

### Task 2: settings 页接入 t-cell（含新建 TDesign 渲染 e2e）

**Files:**
- Create: `tests/e2e/tool-pages-tdesign.test.ts`
- Modify: `miniprogram/pages/settings/settings.json`、`settings.wxml`、`settings.wxss`

**Interfaces:**
- Consumes: Task 1 的组件路径约定 `tdesign-miniprogram/cell/cell`
- Produces: e2e 文件 `tests/e2e/tool-pages-tdesign.test.ts`（Task 3 往里追加用例）

- [ ] **Step 1: 写失败的 e2e**

新建 `tests/e2e/tool-pages-tdesign.test.ts`：

```ts
import {
  connectOrLaunch,
  closeSession,
  currentRoute,
  countSelector,
  navTo,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
} from './helpers';

describe('工具页 TDesign 接入 E2E', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await connectOrLaunch();
    mp = session.miniProgram;
  }, 120000);

  afterAll(() => closeSession(session));

  it('settings 页菜单渲染为 t-cell', async () => {
    await navTo(mp, '/pages/settings/settings');
    expect(await currentRoute(mp)).toContain('settings');
    expect(await countSelector(mp, '.settings__menus >>> .t-cell')).toBe(6);
  }, T);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx tsc --noEmit -p tsconfig.json && npx jest -c tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/tool-pages-tdesign.test.ts`
Expected: FAIL —— `.t-cell` 计数为 0（页面还没用 TDesign）。若选择器语法报错而非计数失败，先修选择器。

- [ ] **Step 3: 注册组件（settings.json 整体替换）**

```json
{
  "navigationBarTitleText": "设置",
  "usingComponents": {
    "t-cell": "tdesign-miniprogram/cell/cell"
  }
}
```

- [ ] **Step 4: 重写 wxml（settings.wxml 整体替换）**

先对照 `https://tdesign.tencent.com/miniprogram/components/cell` 核对属性名（title / note / arrow / hover / bordered），一致则落盘：

```xml
<view class="container settings">
  <view class="card settings__menus">
    <t-cell
      wx:for="{{menus}}"
      wx:key="id"
      class="settings__menu {{item.id === 'delete' ? 'settings__menu--danger' : ''}}"
      title="{{item.label}}"
      arrow
      hover
      data-id="{{item.id}}"
      bind:click="onTapMenu"
    />
  </view>
  <view class="text-secondary settings__ver">遇见爱 v1.0.1</view>
</view>
```

注意：`onTapMenu` 读 `e.currentTarget.dataset.id`，`data-id` 挂在 t-cell 宿主上不受影响。若实测 `bind:click` 的 `currentTarget.dataset` 取不到值，改用原生 `bindtap`（tap 从组件内部冒泡到宿主），其余不动。

- [ ] **Step 5: 重写 wxss（settings.wxss 整体替换）**

```css
.settings__menus {
  padding: 0;
  overflow: hidden;
  border-radius: var(--radius-card);
}
.settings__menu--danger {
  --td-cell-title-color: var(--color-primary);
}
.settings__ver {
  text-align: center;
  font-size: 24rpx;
  margin-top: 32rpx;
}
```

若「注销账号」行标题没有变红，在 DevTools WXML 面板查 t-cell 标题节点的实际 CSS 变量名并替换 `--td-cell-title-color`。

- [ ] **Step 6: 跑测试确认通过**

Run: `npx jest -c tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/tool-pages-tdesign.test.ts`
Expected: PASS。若 `.t-cell` 计数为 0 但页面正常，在 DevTools WXML 面板查 cell 组件根节点实际 class 名并更新选择器。

- [ ] **Step 7: p1-profile 回归（settings 段）**

Run: `npx jest -c tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/p1-profile.test.ts`
Expected: 全过（settings 的 pageData('menus') 断言不受 wxml 改写影响；任何 FAIL 都先修再继续）

- [ ] **Step 8: 目检**

DevTools 打开「设置」页：6 行菜单、箭头、按压态、最后一行红色「注销账号」、版本号居中。

- [ ] **Step 9: Commit**

```bash
git add miniprogram/pages/settings tests/e2e/tool-pages-tdesign.test.ts
git commit -m "feat(ui): settings 页接入 t-cell"
```

---

### Task 3: message 页接入 t-avatar / t-badge / t-empty

**Files:**
- Modify: `miniprogram/pages/message/message.json`、`message.wxml`、`message.wxss`、`tests/e2e/tool-pages-tdesign.test.ts`

**Interfaces:**
- Consumes: Task 1 组件路径约定；Task 2 的 e2e 文件
- Produces: 无

- [ ] **Step 1: 追加失败的 e2e**

在 `tool-pages-tdesign.test.ts` 的 settings 用例之后追加：

```ts
  it('message 页会话渲染 t-avatar', async () => {
    await mp.switchTab('/pages/message/message');
    expect(await countSelector(mp, '.message__item >>> .t-avatar')).toBeGreaterThanOrEqual(1);
  }, T);
```

Run: `npx tsc --noEmit -p tsconfig.json && npx jest -c tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/tool-pages-tdesign.test.ts`
Expected: 新用例 FAIL（t-avatar 计数 0），settings 用例仍 PASS。

- [ ] **Step 2: 注册组件（message.json 整体替换）**

```json
{
  "navigationBarTitleText": "消息",
  "usingComponents": {
    "t-avatar": "tdesign-miniprogram/avatar/avatar",
    "t-badge": "tdesign-miniprogram/badge/badge",
    "t-empty": "tdesign-miniprogram/empty/empty"
  }
}
```

- [ ] **Step 3: 重写 wxml（message.wxml 整体替换）**

先对照文档核对 avatar（image / size / shape）、badge（count）、empty（description）属性名：

```xml
<view class="container message">
  <view class="message__list">
    <view
      wx:for="{{sessions}}"
      wx:key="id"
      class="message__item card"
      data-id="{{item.id}}"
      bindtap="onTapSession"
    >
      <t-avatar class="message__avatar" image="{{item.avatar}}" shape="circle" size="88" />
      <view class="message__body">
        <view class="message__name">{{item.nickname}}</view>
        <view class="message__last text-secondary">{{item.lastMessage}}</view>
      </view>
      <t-badge wx:if="{{item.unread}}" class="message__badge-host" count="{{item.unread}}" />
    </view>
  </view>
  <t-empty wx:if="{{!sessions.length}}" class="message__empty" description="还没有消息" />
</view>
```

注意：`.message__item` class 与 `data-id`/`bindtap="onTapSession"` 保持不变（`tests/e2e/app.test.ts:50` 与 `message.test.ts` 依赖）。avatar 尺寸若 `size="88"` 不生效，按文档改数字型或删掉 size 用默认值，再在 `.message__avatar` 里用 width/height 约束宿主。

- [ ] **Step 4: 重写 wxss（message.wxss 整体替换）**

```css
.message__list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.message__item {
  display: flex;
  align-items: center;
}
.message__avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  overflow: hidden;
  background: #eeeeee;
  flex-shrink: 0;
}
.message__body {
  flex: 1;
  margin-left: 20rpx;
  min-width: 0;
}
.message__name {
  font-size: 30rpx;
  font-weight: 600;
}
.message__last {
  margin-top: 6rpx;
  font-size: 26rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.message__badge-host {
  margin-left: 16rpx;
}
```

（原 `.message__badge`、`.message__empty` 规则删除，交给 t-badge / t-empty。）

- [ ] **Step 5: 跑测试确认通过**

Run: `npx jest -c tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/tool-pages-tdesign.test.ts`
Expected: 两个用例都 PASS

- [ ] **Step 6: 存量 e2e 回归**

Run: `npx jest -c tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/app.test.ts tests/e2e/message.test.ts`
Expected: 全过（`.message__item` 计数断言必须仍为 1）

- [ ] **Step 7: 目检**

会话头像圆形、未读红点角标、空态「还没有消息」插画/文案居中。

- [ ] **Step 8: Commit**

```bash
git add miniprogram/pages/message tests/e2e/tool-pages-tdesign.test.ts
git commit -m "feat(ui): message 页接入 t-avatar/t-badge/t-empty"
```

---

### Task 4: tags-edit 页接入 t-check-tag / t-button

**Files:**
- Modify: `miniprogram/pages/tags-edit/tags-edit.json`、`tags-edit.wxml`、`tags-edit.wxss`

**Interfaces:**
- Consumes: Task 1 组件路径约定
- Produces: 无

说明：本页无新增 DOM 断言（标签选中态依赖登录后的云端资料，单独跑数据不稳定），回归依赖 p1-profile 的 `pageData('pools')` 断言 + 目检。

- [ ] **Step 1: 注册组件（tags-edit.json 整体替换）**

```json
{
  "navigationBarTitleText": "选择标签",
  "usingComponents": {
    "t-check-tag": "tdesign-miniprogram/check-tag/check-tag",
    "t-button": "tdesign-miniprogram/button/button"
  }
}
```

- [ ] **Step 2: 重写 wxml（tags-edit.wxml 整体替换）**

先对照 `https://tdesign.tencent.com/miniprogram/components/check-tag` 核对 `checked` 属性与事件名（文档为 `bind:change`；若该版本是 `bind:click` 则替换，`e.currentTarget.dataset` 取法不变）：

```xml
<view class="container tags">
  <view class="text-secondary tags__tip">从预设池中选择，每类最多 5 个</view>

  <view class="card tags__group" wx:for="{{pools}}" wx:for-item="g" wx:key="key">
    <view class="tags__title">{{g.title}}</view>
    <view class="tags__chips">
      <t-check-tag
        wx:for="{{g.items}}"
        wx:key="name"
        class="tags__chip"
        checked="{{item.selected}}"
        data-group="{{g.key}}"
        data-name="{{item.name}}"
        bind:change="onToggle"
      >{{item.name}}</t-check-tag>
    </view>
  </view>

  <t-button class="tags__save-btn" theme="primary" block loading="{{saving}}" disabled="{{saving}}" bind:tap="onSave">保存</t-button>
</view>
```

- [ ] **Step 3: 重写 wxss（tags-edit.wxss 整体替换）**

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
  margin: 0 16rpx 16rpx 0;
}
.tags__save-btn {
  margin-top: 16rpx;
}
```

- [ ] **Step 4: 类型检查与单测**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 均通过（js 零改动）

- [ ] **Step 5: p1-profile 回归（tags 段）**

Run: `npx jest -c tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/p1-profile.test.ts`
Expected: 全过。重点：`pools` 断言、保存流程、「每类最多 5 个」toast（`onToggle` 行为不变）

- [ ] **Step 6: 目检**

四组标签卡、选中态为品牌色、保存按钮整宽品牌色、loading 时禁用。

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/tags-edit
git commit -m "feat(ui): tags-edit 页接入 t-check-tag/t-button"
```

---

### Task 5: album-edit 页视觉升级（t-image / t-icon）

**Files:**
- Modify: `miniprogram/pages/album-edit/album-edit.json`、`album-edit.wxml`、`album-edit.wxss`

**Interfaces:**
- Consumes: Task 1 组件路径约定
- Produces: 无

说明：缩略图/空槽依赖云端数据，DOM 断言不稳定，回归依赖 p1-profile 的 `pageData('slots')` 断言 + 目检。

- [ ] **Step 1: 注册组件（album-edit.json 整体替换）**

```json
{
  "navigationBarTitleText": "编辑相册",
  "usingComponents": {
    "t-image": "tdesign-miniprogram/image/image",
    "t-icon": "tdesign-miniprogram/icon/icon"
  }
}
```

- [ ] **Step 2: 重写 wxml（album-edit.wxml 整体替换）**

先对照文档核对 image（src / mode / width / height / shape）与 icon（name / size）属性名：

```xml
<view class="container album">
  <view class="text-secondary album__tip">每个分类上传一张照片，共 5 张</view>
  <view class="card">
    <view class="album__row" wx:for="{{slots}}" wx:key="category">
      <text class="album__cat">{{item.category}}</text>
      <view class="album__ops">
        <t-image
          wx:if="{{item.fileID}}"
          class="album__thumb"
          src="{{item.fileID}}"
          mode="aspectFill"
          width="120rpx"
          height="120rpx"
          shape="round"
          bindtap="onPreview"
          data-category="{{item.category}}"
        />
        <view
          wx:else
          class="album__add"
          bindtap="onChoose"
          data-category="{{item.category}}"
        >
          <t-icon name="add" size="40rpx" />
          <text class="album__add-text">上传</text>
        </view>
        <text wx:if="{{item.fileID}}" class="album__op text-primary" bindtap="onChoose"
              data-category="{{item.category}}">更换</text>
        <text wx:if="{{item.fileID}}" class="album__op text-secondary" bindtap="onRemove"
              data-category="{{item.category}}">删除</text>
      </view>
    </view>
  </view>
</view>
```

注意：缩略图点击是 `onPreview`、空槽点击是 `onChoose`，与原版一一对应；`data-category` 原样保留。若 t-image 宿主的 `bindtap` 不触发，改为包一层 `<view class="album__thumb" bindtap=... data-category=...>` 内嵌 t-image（尺寸约束移到该 view）。

- [ ] **Step 3: 重写 wxss（album-edit.wxss 整体替换）**

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
  overflow: hidden;
  background: #eeeeee;
}
.album__add {
  width: 120rpx;
  height: 120rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed #dddddd;
  border-radius: 12rpx;
  box-sizing: border-box;
  color: var(--color-text-secondary);
}
.album__add-text {
  font-size: 22rpx;
  margin-top: 4rpx;
}
.album__op {
  font-size: 24rpx;
  margin-left: 20rpx;
}
```

- [ ] **Step 4: 类型检查与单测**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 均通过

- [ ] **Step 5: p1-profile 回归（album 段）**

Run: `npx jest -c tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/p1-profile.test.ts`
Expected: 全过（`slots` 分类顺序断言、上传与保存流程不变）

- [ ] **Step 6: 目检**

空槽为虚线框 + 加号图标；已传分类显示圆角缩略图；更换/删除文案可点。

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/album-edit
git commit -m "feat(ui): album-edit 页视觉升级 t-image/t-icon"
```

---

### Task 6: story-edit 页视觉升级（t-icon，原生 picker 保留）

**Files:**
- Modify: `miniprogram/pages/story-edit/story-edit.json`、`story-edit.wxml`、`story-edit.wxss`

**Interfaces:**
- Consumes: Task 1 组件路径约定
- Produces: 无

说明：录音/试听按钮保留「●/■/▶」字符（可靠且语义清晰），只替换箭头与「添加」图标。

- [ ] **Step 1: 注册组件（story-edit.json 整体替换）**

```json
{
  "navigationBarTitleText": "语音故事",
  "usingComponents": {
    "t-icon": "tdesign-miniprogram/icon/icon"
  }
}
```

- [ ] **Step 2: 重写 wxml（story-edit.wxml 整体替换）**

```xml
<view class="container story">
  <view class="text-secondary story__tip">录制最多 5 段语音故事，每段 ≤60 秒</view>

  <view class="card story__item" wx:for="{{stories}}" wx:key="index">
    <picker range="{{topics}}" value="{{item.topic}}" bindchange="onPickTopic" data-index="{{index}}">
      <view class="story__row story__row--topic">
        <text class="story__topic {{item.topic ? '' : 'text-secondary'}}">{{item.topic || '选择话题'}}</text>
        <t-icon name="chevron-right" size="40rpx" />
      </view>
    </picker>

    <view class="story__row story__row--ops">
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

  <view wx:if="{{stories.length < 5}}" class="story__add" bindtap="onAddStory">
    <t-icon name="add" size="36rpx" />
    <text>添加故事</text>
  </view>
</view>
```

注意：所有处理器名（onPickTopic / onTapRecord / onTapStop / onTogglePlay / onDeleteStory / onAddStory）与 `data-index` 原样保留；原生 `<picker>` 包在话题行外层不动。

- [ ] **Step 3: 重写 wxss（story-edit.wxss 整体替换）**

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
.story__row--ops {
  justify-content: flex-start;
}
.story__topic {
  font-size: 28rpx;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 24rpx;
  color: var(--color-primary);
  background: #ffffff;
  border-radius: var(--radius-card);
}
```

- [ ] **Step 4: 类型检查与单测**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 均通过

- [ ] **Step 5: p1-profile 回归**

Run: `npx jest -c tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/p1-profile.test.ts`
Expected: 全过

- [ ] **Step 6: 目检**

话题行右侧 chevron 图标、操作行「● 开始录音/▶ 试听/删除」间距正常、「＋ 添加故事」卡片带图标。

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/story-edit
git commit -m "feat(ui): story-edit 页视觉升级 t-icon"
```

---

### Task 7: profile-edit 页接入 t-cell / t-check-tag / t-button

**Files:**
- Modify: `miniprogram/pages/profile-edit/profile-edit.json`、`profile-edit.wxml`、`profile-edit.wxss`

**Interfaces:**
- Consumes: Task 1 组件路径约定
- Produces: 无

要点：**picker 行**（性别/生日/恋爱目标/情感状态/身高/学历/职业/现居地/家乡/吸烟/喝酒/打牌）改为「原生 `<picker>` 包 `t-cell`」；**input 行**（昵称/签名/学校/房产/车辆/收入/电话/微信号）保留原 `edit__row` + 原生 `<input>`（`type="nickname"` 不走组件转发）；**textarea** 原样；**头像/手机号 open-type 按钮**原样；家庭背景 chips 换 `t-check-tag`；保存换 `t-button`。

- [ ] **Step 1: 注册组件（profile-edit.json 整体替换）**

```json
{
  "navigationBarTitleText": "编辑资料",
  "usingComponents": {
    "t-cell": "tdesign-miniprogram/cell/cell",
    "t-check-tag": "tdesign-miniprogram/check-tag/check-tag",
    "t-button": "tdesign-miniprogram/button/button"
  }
}
```

- [ ] **Step 2: 重写 wxml（profile-edit.wxml 整体替换为下文）**

（check-tag 事件名与 Task 4 相同的核对规则：文档 `bind:change`，若版本为 click 则替换。）

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

    <t-cell title="嘉宾编号" note="{{draft.basic.guestNo || '注册后自动生成'}}" />

    <view class="edit__row">
      <text class="edit__label">昵称</text>
      <input class="edit__input" type="nickname" maxlength="20"
             value="{{draft.basic.nickname}}" disabled="{{draft.basicInit}}"
             bindinput="onInput" data-path="basic.nickname" placeholder="请输入昵称" />
    </view>

    <picker range="{{genders}}" disabled="{{draft.basicInit}}" bindchange="onPickGender">
      <t-cell title="性别" note="{{draft.basic.gender || '请选择'}}" arrow hover />
    </picker>

    <picker mode="date" end="{{today}}" value="{{draft.basic.birthday}}"
            disabled="{{draft.basicInit}}" bindchange="onPickBirthday">
      <t-cell title="生日" note="{{draft.basic.birthday ? draft.basic.birthday + (draft.basic.constellation ? '（' + draft.basic.constellation + '）' : '') : '请选择'}}" arrow hover />
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
      <t-cell title="恋爱目标" note="{{draft.about.loveGoal || '请选择'}}" arrow hover />
    </picker>

    <picker range="{{emotionalStatus}}" bindchange="onPickOption" data-field="about.emotionalStatus" data-options="emotionalStatus">
      <t-cell title="情感状态" note="{{draft.about.emotionalStatus || '请选择'}}" arrow hover />
    </picker>

    <picker range="{{heightRange}}" value="{{draft.about.height - 140}}" bindchange="onPickHeight">
      <t-cell title="身高" note="{{draft.about.height ? draft.about.height + 'cm' : '请选择'}}" arrow hover />
    </picker>

    <picker range="{{educations}}" bindchange="onPickOption" data-field="about.education" data-options="educations">
      <t-cell title="学历" note="{{draft.about.education || '请选择'}}" arrow hover />
    </picker>

    <picker range="{{jobs}}" bindchange="onPickOption" data-field="about.job" data-options="jobs">
      <t-cell title="职业" note="{{draft.about.job || '请选择'}}" arrow hover />
    </picker>

    <picker mode="region" bindchange="onRegion" data-field="about.city">
      <t-cell title="现居地" note="{{draft.about.city || '请选择'}}" arrow hover />
    </picker>

    <picker mode="region" bindchange="onRegion" data-field="about.hometown">
      <t-cell title="家乡" note="{{draft.about.hometown || '请选择'}}" arrow hover />
    </picker>

    <view class="edit__row">
      <text class="edit__label">学校</text>
      <input class="edit__input" maxlength="20" value="{{draft.about.school}}"
             bindinput="onInput" data-path="about.school" placeholder="最高学历院校" />
    </view>

    <view class="edit__row edit__row--column">
      <text class="edit__label">家庭背景（可多选）</text>
      <view class="edit__chips">
        <t-check-tag
          wx:for="{{familyBackground}}"
          wx:key="*this"
          class="edit__chip"
          checked="{{fbMap[item]}}"
          data-item="{{item}}"
          bind:change="onToggleFamily"
        >{{item}}</t-check-tag>
      </view>
    </view>
  </view>

  <!-- 吸烟/喝酒/打牌：三个独立 picker -->
  <view class="card edit__card">
    <picker range="{{habits}}" bindchange="onPickHabit" data-field="about.smoke">
      <t-cell title="吸烟" note="{{draft.about.smoke || '请选择'}}" arrow hover />
    </picker>
    <picker range="{{habits}}" bindchange="onPickHabit" data-field="about.drink">
      <t-cell title="喝酒" note="{{draft.about.drink || '请选择'}}" arrow hover />
    </picker>
    <picker range="{{habits}}" bindchange="onPickHabit" data-field="about.gamble">
      <t-cell title="打牌" note="{{draft.about.gamble || '请选择'}}" arrow hover />
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

  <t-button class="edit__save-btn" theme="primary" block loading="{{saving}}" disabled="{{saving}}" bind:tap="onSave">保存</t-button>
</view>
```

- [ ] **Step 3: 更新 wxss（profile-edit.wxss 定点增删）**

删除以下规则（已被组件取代）：
- `.edit__arrow { ... }`（54-57 行）
- `.edit__chip { ... }` 与 `.edit__chip--on { ... }`（79-90 行，class 名保留给 t-check-tag 宿主用，规则重写为下方间距版）
- `.edit__save { ... }` 与 `.edit__save--loading { ... }`（98-106 行）

在文件末尾追加：

```css
.edit__chip {
  margin: 0 16rpx 16rpx 0;
}
.edit__save-btn {
  margin-top: 32rpx;
}
```

其余规则（`edit__row` / `edit__input` / `edit__textarea` / `edit__chips` / `edit__avatar*` / `edit__mini-btn` 等）全部保留不动。

- [ ] **Step 4: 类型检查与单测**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 均通过

- [ ] **Step 5: p1-profile 回归（最关键一页）**

Run: `npx jest -c tests/jest.config.js --selectProjects e2e --runInBand tests/e2e/p1-profile.test.ts`
Expected: 全过。重点覆盖：城市选择（`onRegion`）、昵称保存与 `basicInit` 置位、锁定后重复保存拒绝、手机号获取路径、云端回读一致

- [ ] **Step 6: 目检**

四张卡片分区清晰；picker 行右侧箭头 + 「请选择」占位灰字；chips 选中品牌色；保存按钮整宽品牌色；「微信获取」「头像」按钮功能正常。

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/profile-edit
git commit -m "feat(ui): profile-edit 页接入 t-cell/t-check-tag/t-button"
```

---

### Task 8: 全量回归、主包体积复查、收尾

**Files:**
- 无新增；如回归发现修正，按对应页面提交

**Interfaces:**
- Consumes: Task 1-7 全部产出
- Produces: 可交付状态

- [ ] **Step 1: 类型检查 + 全量单测/集成**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 全绿

- [ ] **Step 2: 全量 e2e**

Run: `npm run test:e2e`
Expected: app / message / p1-profile / tool-pages-tdesign 四个文件全过

- [ ] **Step 3: 主包体积复查**

先跑 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project /Users/geekspeng/OpenSource/GitHub/just4love --qr-format terminal`（需 DevTools 已登录）：命令成功即上传包构建通过；若因体积超限报错，记录错误。再请用户在 DevTools → 详情 → 基本信息 → 代码包体积确认精确数值（本地 miniprogram_npm 5.1MB 不等于上传包——`ignoreUploadUnusedFiles: true` 会裁剪未引用文件）。**上传包必须 < 2MB**；超出则停下向用户报告（按需引入或分包再议，不自行扩 scope）。

- [ ] **Step 4: 视觉走查清单（DevTools 逐页）**

- settings：6 行 t-cell 菜单、注销行红字；**点一行菜单（如「帮助」）确认能跳转 agreement 页**（t-cell 宿主 dataset 传递无自动化覆盖）
- message：圆形头像、未读角标、空态
- tags-edit：4 组 t-check-tag、选中品牌色、整宽保存按钮；**点选/取消一个标签确认切换与保存可用**（t-check-tag 宿主 dataset 传递无自动化覆盖）
- album-edit：虚线空槽带加号、圆角缩略图、更换/删除；**点「＋上传」确认能拉起选图、点已传分类缩略图确认 onPreview 预览触发**（两者绑定无自动化覆盖）
- story-edit：话题行 chevron、录音字符按钮、「＋ 添加故事」；**点话题行确认原生 picker 弹层正常**
- profile-edit：四卡片、13 个 picker 行、chips、保存按钮；**点一个 picker 行（如「性别」外的任选）确认弹层与回填正常、点保存确认流程走通、头像/「微信获取」按钮可点**
- 全局：主题色仍为 #FF5A5F（t-button/t-check-tag 选中态）

- [ ] **Step 5: 收尾提交（如有修正）**

回归与走查中产生的修正按对应 scope 提交；无修正则无新提交。

---

## 自审记录（写计划时已核）

1. **Spec 覆盖**：spec 的 6 页映射 → Task 2-7 一一对应；依赖/构建/主题 → Task 1；体积与 e2e 风险 → Task 1 Step 9 / Task 8；行为不变约束 → 各任务「处理器名/data-* 原样保留」条款。spec 的 message 行写的是「t-cell + t-avatar + t-badge」，本计划实现为 t-avatar/t-badge/t-empty、行布局保留自定义 card 行（t-cell 无头像位，slot 方案风险高）——spec 已随本计划同步修订。
2. **占位符扫描**：无 TBD/TODO；所有 wxml/wxss/json 给出完整内容；组件属性名不确定处均给出核对 URL 与回退方案，不是空指令。
3. **一致性**：组件注册路径统一 `tdesign-miniprogram/<name>/<name>`；e2e 选择器 `.settings__menus >>> .t-cell`、`.message__item >>> .t-avatar` 与 Task 2/3 的 wxml class 对应；`.message__item`/`data-id`/`onTapSession` 与 `tests/e2e/app.test.ts:50`、`message.test.ts` 现状一致。
