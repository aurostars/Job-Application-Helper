#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "== Job-Application-Helper 一键安装 & 构建 =="
echo "目录: $(pwd)"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 node。请先安装 Node.js (建议 LTS 版本)，然后重试。"
  echo "下载: https://nodejs.org/"
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[错误] 未检测到 npm。请确认 Node.js 安装正常，然后重试。"
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 1
fi

echo "node: $(node -v)"
echo "npm:  $(npm -v)"
echo

if [[ -f package-lock.json ]]; then
  echo "== 安装依赖: npm ci =="
  npm ci
else
  echo "== 安装依赖: npm install (未找到 package-lock.json) =="
  npm install
fi

echo
echo "== 构建: npm run build =="
npm run build

echo
echo "✅ 完成！dist/ 目录已生成。"
read -n 1 -s -r -p "按任意键退出..."
echo
