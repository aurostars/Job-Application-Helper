#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "== Job-Application-Helper 一键发布 Release =="
echo "目录: $(pwd)"
echo

if ! command -v git >/dev/null 2>&1; then
  echo "[错误] 未检测到 git。请先安装 Git，然后重试。"
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
  echo "[错误] 当前分支是 $branch，不是 main。请先切换到 main 再发布。"
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 1
fi

if [[ -n "$(git status --short)" ]]; then
  echo "[错误] 工作区有未提交的改动。请先提交或清理后再发布。"
  git status --short
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 1
fi

git fetch origin --tags

latest_tag="$(git tag --list 'v*' --sort=-version:refname | head -n 1)"

default_tag="${TAG_NAME:-}"
if [[ -z "$default_tag" ]]; then
  if [[ -z "$latest_tag" ]]; then
    default_tag="v1.0.0"
  else
    version_core="${latest_tag#v}"
    IFS='.' read -r major minor patch extra <<< "$version_core"
    major="${major:-1}"
    minor="${minor:-0}"
    patch="${patch:-0}"

    if [[ -n "${extra:-}" ]]; then
      echo "[错误] 最新标签 $latest_tag 不是标准递增版本号，请手动设置 TAG_NAME 后再发布。"
      read -n 1 -s -r -p "按任意键退出..."
      echo
      exit 1
    fi

    if [[ ! "$major" =~ ^[0-9]+$ || ! "$minor" =~ ^[0-9]+$ || ! "$patch" =~ ^[0-9]+$ ]]; then
      echo "[错误] 最新标签 $latest_tag 不是纯数字版本号，请手动设置 TAG_NAME 后再发布。"
      read -n 1 -s -r -p "按任意键退出..."
      echo
      exit 1
    fi

    default_tag="v${major}.${minor}.$((patch + 1))"
  fi
fi

tag_name="$(printf '%s' "$default_tag" | tr -d '[:space:]')"

if [[ -z "$tag_name" ]]; then
  echo "[错误] 版本号不能为空。"
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 1
fi

if [[ ! "$tag_name" =~ ^v[0-9]+(\.[0-9]+){1,2}([-._a-zA-Z0-9]+)?$ ]]; then
  echo "[错误] 版本号格式无效。请使用类似 v1.0.1 的格式。"
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 1
fi

if git rev-parse "$tag_name" >/dev/null 2>&1; then
  echo "[错误] 标签 $tag_name 已存在。请更换版本号。"
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 1
fi

echo
if [[ -n "$latest_tag" ]]; then
  echo "当前最新版本: $latest_tag"
else
  echo "当前未发现已有版本标签。"
fi
echo "即将发布版本: $tag_name"
echo "这会触发 GitHub Actions 自动构建扩展压缩包并上传到 Release。"

confirm="${CONFIRM_RELEASE:-}"
if [[ -z "$confirm" ]]; then
  read -r -p "确认继续？(y/N): " confirm
fi

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "已取消发布。"
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 0
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo
  echo "[演练] 将执行："
  echo "git tag $tag_name"
  echo "git push origin $tag_name"
  echo
  echo "[演练] GitHub Actions 将随后自动构建并上传 Release 附件。"
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 0
fi

git tag "$tag_name"
git push origin "$tag_name"

echo
echo "发布命令已提交。"
echo "请到 GitHub Actions 查看“发布扩展安装包”工作流进度。"
echo "完成后，压缩包会出现在对应版本的 GitHub Release 中。"
read -n 1 -s -r -p "按任意键退出..."
echo
