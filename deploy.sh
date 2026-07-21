#!/usr/bin/env bash
# 宝丰一高校园频道 — 改代码→上线一键部署
# 前置：环境变量 CLOUDFLARE_API_TOKEN 必须已设置
# 用法：
#   CLOUDFLARE_API_TOKEN=xxx ./deploy.sh
# 或先 export CLOUDFLARE_API_TOKEN=xxx

set -euo pipefail

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "❌ 缺少 CLOUDFLARE_API_TOKEN 环境变量" >&2
  echo "请先执行：export CLOUDFLARE_API_TOKEN='你的Cloudflare_API_Token'" >&2
  exit 1
fi

echo "==> 1/3 构建前端 (web_build)"
node _build.mjs

echo ""
echo "==> 2/3 部署前端到 Cloudflare Pages"
wrangler pages deploy web_build --project-name=baofeng-campus --branch main

echo ""
echo "==> 3/3 部署 Worker 反代"
cd worker
wrangler deploy

echo ""
echo "✅ 部署完成。前端 Pages 硬刷新 (Ctrl/Cmd+Shift+R) 看效果；Worker 即时生效。"
