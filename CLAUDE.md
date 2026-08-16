# CLAUDE.md

## 敏感值仅保留本地，不入库（重要约定）

真实云环境 ID 与正式 appid **只存在于本地工作区，永不提交/推送**：

- `miniprogram/app.js` — `wx.cloud.init({ env: ... })` 的 env
- `project.config.json` — `appid` 字段

仓库里保留占位值（`just4love-env` / 测试 appid）。已做的防护：

1. 两文件设置了 `git update-index --skip-worktree`（`git add .` / `git commit -a` 不会带入）
2. `.claude/hooks/block-sensitive-commit.sh`（PreToolUse）强制拦截：暂存区含 env/appid 行改动的提交、推送 `backup/*` 分支或 `--all`/`--mirror`
3. 本地分支 `backup/*` 含未脱敏的历史提交，**永不推送**

因此：不要 `git add -f` / `--no-skip-worktree` 这两个文件；提交前若被 hook 拦截，`git restore --staged` 它们后重新提交；换环境或换 appid 时只在本地改，不入库。

## 开发与测试

- 单元/集成测试：`npm test`；E2E 需本机微信开发者工具：`npm run test:e2e`
- 写 E2E 前先读 `.claude/skills/e2e-test`（本机 DevTools 的通道限制与断言原语，勿凭官方示例直觉写）
