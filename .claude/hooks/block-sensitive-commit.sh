#!/bin/bash
# 拦截真实云环境 ID / appid 入库（约定：仅保留本地，见 CLAUDE.md）
# PreToolUse(Bash) 钩子：stdin 收工具调用 JSON，exit 2 = 阻止该命令
# 注意：本脚本按「键名所在行的改动」判断，不含任何真实值，可安全入库。

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)

# 只关心 git commit / git push，其余命令直接放行
case "$cmd" in
  *git*commit* | *git*push*) ;;
  *) exit 0 ;;
esac

# 1) 暂存区里 app.js 的 env 行 / project.config.json 的 appid 行有改动 → 拦截
#    （只匹配键名行，无论值是真实值还是占位值，这两个值位的变更一律本地协商）
if git diff --cached -U0 -- miniprogram/app.js project.config.json 2>/dev/null \
  | grep -qE "^[-+][^-+].*(env:[[:space:]]*'|\"appid\")"; then
  echo "拦截：暂存区包含 miniprogram/app.js 的 env 行或 project.config.json 的 appid 行改动。" >&2
  echo "约定（CLAUDE.md）：真实云环境 ID 与 appid 仅保留本地、不入库；两文件已设 skip-worktree。" >&2
  echo "请 git restore --staged miniprogram/app.js project.config.json 后重新提交。" >&2
  exit 2
fi

# 2) 推送 backup/ 分支或 --all/--mirror 会连同未脱敏历史一起泄露 → 拦截
if [[ "$cmd" == *git*push* ]]; then
  if [[ "$cmd" == *backup/* || "$cmd" == *--all* || "$cmd" == *--mirror* ]]; then
    echo "拦截：backup/* 分支包含未脱敏历史（真实 env/appid 提交），--all/--mirror 会一并推送。" >&2
    echo "请只推送明确的主分支 refspec，如 git push origin main。" >&2
    exit 2
  fi
fi

exit 0
