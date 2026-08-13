# just4love 微信小程序骨架 — 设计文档

- **日期**：2026-08-13
- **状态**：已确认，待实现
- **范围**：空壳骨架（可运行的微信小程序 + 完整测试基础设施）

## 1. 背景与目标

创建一个类似「牵手」的相亲类微信小程序项目骨架。本次只搭建**可运行的空壳**：

- 正确的目录结构与配置
- 3 个 tabBar 页面（推荐 / 消息 / 我的）
- tabBar 图标占位
- 接入微信云开发（Serverless）
- 完整的测试基础设施（单元 / 集成 / E2E）
- 少量真实可测逻辑，确保测试不是空跑

**不做**：真实后端业务逻辑、数据库集合 schema、登录 / IM / 支付、第三方 UI 库、多端。

## 2. 技术栈

- 前端：微信原生小程序（WXML / WXSS / JS）
- 后端：微信云开发（云函数 / 云数据库 / 云存储），不绑定具体环境 ID（占位）
- 测试：Jest + `miniprogram-simulate`（单元）+ 云函数本地调用（集成）+ `miniprogram-automator`（E2E）

## 3. 目录结构

```
just4love/
├── miniprogram/                     # 小程序前端
│   ├── pages/
│   │   ├── recommend/               # 【推荐】tab
│   │   ├── message/                 # 【消息】tab
│   │   └── mine/                    # 【我的】tab
│   ├── components/
│   │   └── recommend-card/          # 推荐卡片组件（真实可测对象）
│   ├── utils/
│   │   ├── format.js                # 格式化工具（真实可测对象）
│   │   └── request.js               # 云函数调用封装
│   ├── assets/
│   │   └── tabbar/                  # 6 个 tabBar 图标占位
│   ├── app.js                       # 入口，wx.cloud.init()
│   ├── app.json                     # 全局配置
│   ├── app.wxss                     # 全局样式
│   └── sitemap.json
├── cloudfunctions/
│   ├── getProfile/                  # 示例云函数（真实可测对象）
│   └── quickstartFunctions/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── jest.config.js
│   ├── jest.setup.js
│   └── e2e.config.js
├── project.config.json
├── project.private.config.json      # gitignore
├── package.json
├── .gitignore
└── README.md
```

## 4. 组件设计

### 4.1 tabBar（3 个 tab）

| Tab | 标题 | 页面路径 | 图标形状 |
|---|---|---|---|
| 推荐 | 推荐 | pages/recommend/recommend | 心形 |
| 消息 | 消息 | pages/message/message | 对话框气泡 |
| 我的 | 我的 | pages/mine/mine | 人形 |

每个 tab 需要「默认（灰）+ 选中（粉）」两个 PNG，共 6 个图标，81×81px，≤40KB。

### 4.2 recommend-card 组件

推荐页用到的卡片，接收 properties：

- `user`：对象 `{ nickname, age, height, avatar, tag }`

渲染头像、昵称、年龄、身高、标签。纯展示组件，用于单元测试覆盖。

### 4.3 utils/format.js

纯函数工具模块，提供：

- `formatAge(birthYear)` → 字符串年龄（例 `1995` → `"31岁"`）
- `formatHeight(cm)` → 字符串身高（例 `178` → `"178cm"`，非法值 → `""`）
- `formatDistance(meters)` → 距离（例 `500` → `"500m"`，`1800` → `"1.8km"`）

用于单元测试覆盖。

### 4.4 getProfile 云函数

示例云函数，演示「event 入参 → 查库 → 返回」结构。本次用 mock 数据（不接真库），便于集成测试。

入参 `event.userId`，返回 `{ profile }` 或 `{ error }`。

## 5. 数据流

骨架阶段无真实数据流。页面使用 mock 占位数据：

- 推荐页：内置 1–2 条示例用户数据，用 `recommend-card` 渲染
- 消息页：内置 1 条示例会话
- 我的页：展示占位昵称 / 头像

`utils/request.js` 封装 `wx.cloud.callFunction`，但页面暂不调用真实云函数（等后续接业务）。

## 6. 配置约定

### 6.1 project.config.json

- `appid`：`touristappid`（测试占位，可改）
- `miniprogramRoot`：`miniprogram/`
- `cloudfunctionRoot`：`cloudfunctions/`
- `compileType`：`miniprogram`

### 6.2 主题色

- 主色：`#FF5A5F`（暖粉 / 玫红）
- 写入 `app.wxss` 全局变量 `--color-primary`（小程序 WXSS 不支持原生 CSS 变量在所有版本可用，故同时提供具体色值用法）。

### 6.3 云开发

`app.js` 调用 `wx.cloud.init({ env: 'just4love-env' })`，`env` 为占位，用户创建云环境后替换。

## 7. 错误处理

骨架阶段无复杂错误处理。约定：

- `format.js` 对非法输入返回安全默认值（空串），不抛错
- `getProfile` 云函数对缺失入参返回 `{ error: 'userId required' }`
- `request.js` 捕获 `callFunction` 异常并返回 `null`，由调用方判断

## 8. 测试策略

| 层级 | 工具 | 覆盖对象 | 可在本地验证 |
|---|---|---|---|
| 单元测试 | Jest + `miniprogram-simulate` | `utils/format.js`、`recommend-card` 组件 | ✅ |
| 集成测试 | Jest + 云函数本地调用（mock 云数据库） | `getProfile` 云函数 | ✅ |
| E2E | `miniprogram-automator` | 启动小程序 → 进推荐页 → 切换 tab | ⚠️ 需本机开放微信开发者工具自动化端口，文档写好，用户本机执行 |

npm 脚本：

- `npm test`：单测 + 集成
- `npm run test:unit`：仅单测
- `npm run test:integration`：仅集成
- `npm run test:e2e`：E2E（用户本机执行）

## 9. 实现顺序（实现计划要点）

1. `git init` + `.gitignore`
2. 生成 6 个 tabBar 图标占位
3. `miniprogram/` 目录、app 配置、3 个页面、recommend-card、utils
4. `cloudfunctions/` 示例云函数
5. `package.json` + 测试目录 + Jest 配置 + mock wx
6. 写单测、集成测试
7. 实际运行单测 + 集成测试，确认通过
8. 写 E2E 脚本 + 运行文档（不执行）
9. README + 提交
