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
   注意：重新保存补的 `createdAt` 是保存时刻而非注册时刻（旧用户排序近似）；要精确可
   在控制台按对应用户 `users` 文档的 `createdAt` 回填。
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

## P4 部署与验收（认证与管理能力）

### 部署步骤

1. **云函数**（IDE 右键「上传并部署：云端安装依赖」）：改动 5 个——`setupDb`、`login`、
   `getMyProfile`、`listProfiles`、`getProfileDetail`；新增 4 个——`submitVerification`、
   `getMyVerifications`、`getGroupQr`、`admin`（管理后台聚合入口）。
2. **初始化集合**：部署后调用一次 `setupDb`（幂等）——新增 `verifications` 集合，
   权限设为「仅创建者可读写」。
3. **管理员指定**：云开发控制台将运营者 `users` 文档 `role` 手改为 `admin`（mine 菜单出现「管理后台」）。
4. **群二维码**：管理员进「管理后台 → 配置」上传群二维码（存 `config/groupQr`，认证用户可见）。

### 要点

- 三类认证（身份/学历/职业）任一通过即升级认证嘉宾（`users.role` → `verified`，配额 5→15 自动生效，
  `verifiedTypes` 冗余进 users 供徽章/门槛直读）；`pending/approved` 重复提交幂等，`rejected` 可重新提交。
- 嘉宾管理：`profiles.listed`（上下架，缺省视为上架）与 `profiles.forceHidden`（强制资料隐藏：
  列表排除 + 详情直链 not found）两个独立开关，旧数据零迁移。
- 举报处理：`hide` = 被举报人强制隐藏 + 举报结单 `resolved`；`ignore` = `ignored`。
- 管理防线在 `admin` 云函数（role=admin 守卫），页面入口仅按缓存 role 控制；非管理员直链管理页
  渲染「无权限」空态。
- 管理员侧闭环（审核→升级→配额变化）由集成测试覆盖；E2E 覆盖认证提交/幂等、admin 守卫 forbidden、
  群码未认证态、mine 菜单角色化（单测试号无法构造管理员视角，与 P3 同一声明口径）。

### 验收清单（对应设计文档 §7 与 §10）

- [ ] 认证页三类卡片可提交材料（1-3 张），状态流转 审核中/已认证/已驳回 正确展示
- [ ] 管理后台：认证审核通过/驳回；任一通过后该用户升级认证嘉宾（每日查看 5→15 生效）
- [ ] 管理后台：嘉宾搜索、上下架（遇见列表不再出现）、强制隐藏（详情直链 not found）、恢复
- [ ] 管理后台：举报列表可隐藏（联动强制隐藏）/忽略
- [ ] 管理后台：配额修改保存后立即生效；群二维码可上传更换
- [ ] 交友群页：认证用户见二维码，未认证引导去认证
- [ ] 设置页「推荐给好友」标准分享可用
- [ ] mine 菜单：所有人见「我的认证/加入交友群」，仅管理员见「管理后台」
- [ ] `npm test` 与 `npm run test:e2e` 全部通过

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
