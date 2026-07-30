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

node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22 || (a===22&&b>=12) || (a===20&&b>=19) ? 0 : 1)"
if errorlevel 1 (
  echo [错误] 当前 Node.js 版本不满足要求。
  echo 请安装 Node.js 20.19+ 或 22.12+，推荐使用最新 LTS 版本。
  echo 下载: https://nodejs.org/
  pause
  exit /b 1
)

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
echo == 运行测试: npm test ==
npm test

if errorlevel 1 (
  echo.
  echo [错误] 测试失败，请检查上面的日志。
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
echo 完成！依赖安装、测试和构建均已通过。
echo 浏览器加载目录: %cd%\dist
echo 请在 Chrome/Edge 扩展管理页开启开发者模式，然后选择“加载已解压的扩展程序”。
pause
