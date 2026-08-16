# 工具页接入 TDesign 组件库设计

日期：2026-08-16
状态：已与用户确认设计方向（工具页优先、TDesign、反馈类保留原生）

## 背景与问题

小程序 UI 为原生 WXML/WXSS 全手写，无 UI 组件库。表单/列表类工具页（资料编辑、设置、标签、相册、语音故事、消息）观感简陋：手写行布局、原生 `picker` 弹层、纯文字按钮。核心颜值页（recommend 滑动卡、profile-preview）的打磨另列后续计划，本期先解决工具页。

选型结论（2026-08 经 GitHub 活跃度验证）：

- **TDesign 小程序版**（Tencent/tdesign-miniprogram，最近提交 2026-08-06，活跃）✔ 采用
- Vant Weapp（最近提交 2026-05-09，维护放缓）— 备选
- WeUI 扩展库（观感即微信默认，与"变好看"目标不符）— 排除

## 目标

6 个工具页接入 TDesign 组件库，统一观感、提升表单/列表体验；**业务逻辑 js 零改动**（只动 wxml / wxss / 页面 json / 组件注册）。

## 范围

### 本期（6 页）

profile-edit、settings、tags-edit、album-edit、story-edit、message

### 范围外

- 反馈类 API 保留原生 `wx.showToast` / `wx.showModal` / `wx.showLoading`：换 TDesign 需在每页挂组件实例并改调用方式，样板多收益小（YAGNI），后续按需再换
- recommend、profile-preview、profile-card 自定义组件（下期核心页手搓打磨）
- mine 页（偏展示，顺带可换 Cell，不在本期承诺内）
- 业务逻辑、数据流、云函数

## 方案

### 1. 依赖与构建

- 在 `miniprogram/` 下新建 `package.json`，安装 `tdesign-miniprogram`
- 微信开发者工具「构建 npm」生成 `miniprogram_npm/`；产物提交入库（e2e 依赖本机真实项目路径，免每次手工构建；TDesign 为 MIT 许可）
- 构建后验证主包体积 < 2MB；若超限，改用按需引入或分包再评估
- `app.json` 视需要增加 `"lazyCodeLoading": "requiredComponents"` 减少注入

### 2. 主题接入

`app.wxss` 的 `page` 上将 TDesign 变量映射到现有主题，主题色单一事实源保持现有 `--color-*` 体系不变：

```css
page {
  --td-brand-color: var(--color-primary);        /* #FF5A5F */
  --td-radius-large: var(--radius-card);
  /* 其余 --td-* 按需补充，映射到现有 token 或 TDesign 默认值 */
}
```

### 3. 页面组件映射

| 页面 | 现状 | 替换为 |
|---|---|---|
| profile-edit | 手写行布局 + 原生 input/textarea + 7 处原生 `picker` 弹层 | `t-cell-group` / `t-cell` 行布局；`t-input` / `t-textarea`；`t-picker`（底部弹层式）；`t-check-tag`（家庭背景多选）；`t-button`（保存；`open-type` 的 chooseAvatar / getPhoneNumber 按钮用 `t-button` 原样保留能力，微信获取能力不受影响） |
| settings | 手写菜单行 | `t-cell-group` + `t-cell`（箭头、danger 样式内置），版本号文案保留 |
| tags-edit | 自定义 chips | `t-check-tag`（选中态内置），保存按钮 `t-button` |
| album-edit | 纯文字「＋上传」 | 自定义图片格（`t-image` + `t-icon` 组合，视觉对齐 TDesign Upload 组件：缩略图角标更换/删除），保留现有 onChoose / onPreview / onRemove 云存储逻辑。不用 `t-upload` 组件本体——其「动态增删」模型与「固定 5 分类槽位」不适配 |
| story-edit | 手写录音交互行 | 视觉换 `t-cell` / `t-tag` / `t-icon`，录音 / 试听 / 话题选择逻辑不动 |
| message | 手写会话卡 | `t-cell` + `t-avatar` + `t-badge` 组合，空态 `t-empty` |

### 4. 行为不变约束

- 各页功能行为保持：保存校验、上传（含失败 toast）、录音试听、会话点击均不改变触发路径
- `type="nickname"` 头像昵称填充、`open-type` 手机号获取等微信原生能力必须保留等价入口

## 测试与风险

- **e2e**：wxml 结构变化可能使选择器失效。实施前先读 `.claude/skills/e2e-test`（本机 DevTools 通道限制与断言原语）；逐页跑 `npm run test:e2e` 适配选择器
- **单测**：`npm test` 仅测 js 逻辑，本期 js 零改动，应保持全绿
- **主包体积**：构建 npm 后在 DevTools 查看主包体积，超 2MB 时启用按需引入/分包
- **基础库**：TDesign 要求较新基础库；实施第一步核对官方文档标注的最低版本，若项目当前调试基础库低于该值，先升级再接入

## 成功标准

1. 6 页全部完成 TDesign 替换，观感统一，主题色仍为 `#FF5A5F`
2. `npm test` 与 `npm run test:e2e` 全绿
3. 主包体积 < 2MB
4. 微信原生能力（昵称填充、头像选择、手机号获取）全部可用
