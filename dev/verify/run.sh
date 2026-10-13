#!/bin/bash
# 跑全部验收。零 npm 依赖，只需要本机有一个 Chrome。
#
#   bash dev/verify/run.sh                  → 打本地 index.html
#   bash dev/verify/run.sh --live           → 打线上 GitHub Pages
#
# 退出码：全过 = 0，任何一项不过 = 非 0（可以直接串进 CI 或 git hook）
set -u
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"

if [ "${1:-}" = "--live" ]; then
  TARGET="https://angel-ze.github.io/jiu-yi-jian/"
  echo "目标：线上 $TARGET"
else
  TARGET="file://$ROOT/index.html"
  echo "目标：本地 $TARGET"
fi

echo
echo "════════ ① 回归验收（10 项）════════"
node regression.mjs "$TARGET" "$ROOT/index.html"
A=$?

echo
echo "════════ ② 「就一点」全链路（11 项）════════"
node collection.mjs "$TARGET"
B=$?

echo
if [ $A -eq 0 ] && [ $B -eq 0 ]; then
  echo "✅ 全部通过（回归 10/10 · 就一点 11/11）"
  exit 0
else
  echo "❌ 有未通过项（回归 rc=$A · 就一点 rc=$B）"
  exit 1
fi
