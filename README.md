# just4love

类「牵手」相亲类微信小程序骨架（云开发 + 完整测试基础设施）。

> 本仓库是**可运行的空壳骨架**：目录结构、配置、tabBar、云开发接入、单元/集成/E2E 测试基础设施均已就绪，但不含真实业务逻辑（登录、IM、支付、真实数据库查询等）。

## 技术栈

- **前端**：微信原生小程序（WXML / WXSS / JS）
- **后端**：微信云开发（云函数 / 云数据库 / 云存储）
- **测试**：Jest（单元 + 集成）、miniprogram-automator（E2E）

## 目录结构

```
just4love/
├── miniprogram/                  # 小程序前端
│   ├── pages/                    # 3 个 tab：recommend / message / mine
│   ├── components/recommend-card # 推荐卡片组件（含单测）
│   ├── utils/                    # format.js（格式化）、request.js（云函数封装）
│   ├── assets/tabbar/            # 6 个 tabBar 占位图标
│   ├── app.js / app.json / app.wxss / sitemap.json
├── cloudfunctions/               # getProfile（示例）+ quickstartFunctions（占位）
├── tests/                        # unit / integration / e2e + jest 配置
├── scripts/gen-tabbar-icons.py   # tabBar 图标生成脚本
├── project.config.json           # 微信开发者工具配置
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 跑测试

```bash
npm test                 # 单元 + 集成（全部）
npm run test:unit        # 仅单元测试
npm run test:integration # 仅集成测试
npm run test:coverage    # 带覆盖率
```

E2E 需要在本机运行（见下）。

### 3. 在微信开发者工具中打开

1. 打开**微信开发者工具**，导入本项目根目录
2. `project.config.json` 中 `appid` 当前为测试占位 `touristappid`
   - 想用真实 AppID：在 [mp.weixin.qq.com](https://mp.weixin.qq.com) 获取后替换
3. 点击工具栏「编译」即可预览

### 4. 接入云开发（可选，后续做）

1. 在开发者工具中开通「云开发」，创建一个环境
2. 把 `miniprogram/app.js` 里 `wx.cloud.init({ env: 'just4love-env' })` 的 `env` 换成你的真实环境 ID
3. 右键 `cloudfunctions/getProfile` → 「上传并部署」

## 测试说明

`npm test` 默认只跑单元 + 集成测试（可在 CI / 无 DevTools 环境运行）。E2E 需单独运行。

| 层级 | 语言 | 工具 | 覆盖对象 | 命令 |
|---|---|---|---|---|
| 单元测试 | JS | Jest + miniprogram-simulate | `utils/format.js`、`utils/request.js`、`recommend-card` 组件 | `npm run test:unit` |
| 集成测试 | JS | Jest | `getProfile` 云函数（入参/出参契约） | `npm run test:integration` |
| E2E | TypeScript | Jest + miniprogram-automator | 启动小程序 → 推荐页 → 切换 tab → 元素断言 | `npm run test:e2e` |

E2E 采用官方 `describe`/`it`/`expect` 风格，通过 `page.$('.selector')` 取元素，用 `.tagName`、`.text()`、`.tap()` 断言与交互。

### E2E 运行步骤（仅本机）

E2E 需要驱动微信开发者工具，**无法在 CI / 无头环境执行**（会在连接阶段挂起）：

1. 安装并登录「微信开发者工具」
2. 设置 → 安全设置 → 开启「服务端口」
3. 确认 `tests/e2e.config.ts` 中 `cliPath`（macOS 默认为 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`）和 `port`（默认 `9420`）
4. 运行：

```bash
npm run test:e2e
```

## TypeScript

E2E 测试用 TypeScript 编写（`tests/e2e/*.test.ts`），由 ts-jest 转换。

类型检查：

```bash
npx tsc --noEmit -p tsconfig.json
```

> 注意：当前依赖 TypeScript 5.x。TypeScript 7 尚未被 ts-jest 支持，请勿升级。

## tabBar 图标

`miniprogram/assets/tabbar/` 下 6 张 PNG 是脚本生成的**临时占位**图标（81×81，心形 / 对话框 / 人形）。替换为正式设计稿时保持文件名不变即可。

重新生成（需 Python + Pillow）：

```bash
python3 scripts/gen-tabbar-icons.py
```

## 主题色

主色 `#FF5A5F`（暖粉），定义在 `miniprogram/app.wxss` 的 CSS 变量 `--color-primary`。

## 后续路线（待实现）

骨架之外的真实功能，按依赖顺序：

- [ ] 微信登录 + 用户资料入库（云数据库 `user` 集合）
- [ ] 推荐列表云函数（条件筛选 + 分页）
- [ ] 图片上传（云存储）
- [ ] IM 聊天（云数据库 + 订阅消息）
- [ ] 会员 / 支付（微信支付）

## License

MIT
