#!/usr/bin/env bash
# 演示前一键重置数据：清空并重新生成 seed 数据（含当天课）。
# 用法：./scripts/reset-demo.sh
set -euo pipefail

cd "$(dirname "$0")/../server"
echo "▶ 重置演示数据..."
env -u NODE_OPTIONS npx tsx prisma/seed.ts
echo "✅ 完成。演示账号：顾问 wangli@austin.edu / 老师 wang.teacher@austin.edu（密码 password123）"
