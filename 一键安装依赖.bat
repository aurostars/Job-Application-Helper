@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
echo == Job-Application-Helper 一键安装 ^& 构建 ==
echo 目录: %cd%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 node。请先安装 Node.js ^(建议 LTS 版本^) 后重试。
  echo 下载: https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 npm。请确认 Node.js 安装正常，然后重试。
  pause
  exit /b 1
)

echo node:
node -v
echo npm:
npm -v
echo.

if exist package-lock.json (
  echo == 安装依赖: npm ci ==
  npm ci
) else (
  echo == 安装依赖: npm install ^(未找到 package-lock.json^) ==
  npm install
)

if errorlevel 1 (
  echo.
  echo [错误] 依赖安装失败，请检查上面的日志。
  pause
  exit /b 1
)

echo.
echo == 构建: npm run build ==
npm run build

if errorlevel 1 (
  echo.
  echo [错误] 构建失败，请检查上面的日志。
  pause
  exit /b 1
)

echo.
echo ✅ 完成！dist\ 目录已生成。
pause
