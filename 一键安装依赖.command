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

if ! node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22 || (a===22&&b>=12) || (a===20&&b>=19) ? 0 : 1)"; then
  echo "[错误] 当前 Node.js 版本不满足要求。"
  echo "请安装 Node.js 20.19+ 或 22.12+，推荐使用最新 LTS 版本。"
  echo "下载: https://nodejs.org/"
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 1
fi

if [[ -f package-lock.json ]]; then
  echo "== 安装依赖: npm ci =="
  npm ci
else
  echo "== 安装依赖: npm install (未找到 package-lock.json) =="
  npm install
fi

echo
echo "== 运行测试: npm test =="
npm test

echo
echo "== 构建: npm run build =="
npm run build

echo
echo "完成！依赖安装、测试和构建均已通过。"
echo "浏览器加载目录: $(pwd)/dist"
echo "请在 Chrome/Edge 扩展管理页开启开发者模式，然后选择“加载已解压的扩展程序”。"
read -n 1 -s -r -p "按任意键退出..."
echo
