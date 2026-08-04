@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
echo == Job-Application-Helper 一键发布 Release ==
echo 目录: %cd%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 git。请先安装 Git 后重试。
  pause
  exit /b 1
)

for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD') do set "branch=%%i"
if /i not "%branch%"=="main" (
  echo [错误] 当前分支是 %branch%，不是 main。请先切换到 main 再发布。
  pause
  exit /b 1
)

git status --short > "%temp%\job_helper_git_status.txt"
for %%A in ("%temp%\job_helper_git_status.txt") do set "status_size=%%~zA"
if not "%status_size%"=="0" (
  echo [错误] 工作区有未提交的改动。请先提交或清理后再发布。
  type "%temp%\job_helper_git_status.txt"
  del "%temp%\job_helper_git_status.txt" >nul 2>nul
  pause
  exit /b 1
)
del "%temp%\job_helper_git_status.txt" >nul 2>nul

git fetch origin --tags
if errorlevel 1 (
  echo [错误] 拉取远端标签失败，请检查网络或仓库权限。
  pause
  exit /b 1
)

set "latest_tag="
for /f "delims=" %%i in ('git tag --list "v*" --sort=-version:refname') do (
  if not defined latest_tag set "latest_tag=%%i"
)

set "tag_name=%TAG_NAME%"
if "%tag_name%"=="" (
  if not defined latest_tag (
    set "tag_name=v1.0.0"
  ) else (
    set "version_core=!latest_tag:~1!"
    for /f "tokens=1-4 delims=." %%a in ("!version_core!") do (
      set "major=%%a"
      set "minor=%%b"
      set "patch=%%c"
      set "extra=%%d"
    )

    if not defined major set "major=1"
    if not defined minor set "minor=0"
    if not defined patch set "patch=0"

    echo !major!| findstr /r "^[0-9][0-9]*$" >nul || goto :invalid_latest_tag
    echo !minor!| findstr /r "^[0-9][0-9]*$" >nul || goto :invalid_latest_tag
    echo !patch!| findstr /r "^[0-9][0-9]*$" >nul || goto :invalid_latest_tag

    if defined extra goto :invalid_latest_tag

    set /a next_patch=!patch!+1
    set "tag_name=v!major!.!minor!.!next_patch!"
  )
)

set "tag_name=%tag_name: =%"
if "%tag_name%"=="" (
  echo [错误] 版本号不能为空。
  pause
  exit /b 1
)

echo %tag_name% | findstr /r "^v[0-9][0-9.]*[-._A-Za-z0-9]*$" >nul
if errorlevel 1 (
  echo [错误] 版本号格式无效。请使用类似 v1.0.1 的格式。
  pause
  exit /b 1
)

git rev-parse "%tag_name%" >nul 2>nul
if not errorlevel 1 (
  echo [错误] 标签 %tag_name% 已存在。请更换版本号。
  pause
  exit /b 1
)

echo.
if defined latest_tag (
  echo 当前最新版本: %latest_tag%
) else (
  echo 当前未发现已有版本标签。
)
echo 即将发布版本: %tag_name%
echo 这会触发 GitHub Actions 自动构建扩展压缩包并上传到 Release。

set "confirm=%CONFIRM_RELEASE%"
if "%confirm%"=="" (
  set /p "confirm=确认继续？(y/N): "
)

if /i not "%confirm%"=="y" (
  echo 已取消发布。
  pause
  exit /b 0
)

if "%DRY_RUN%"=="1" (
  echo.
  echo [演练] 将执行：
  echo git tag %tag_name%
  echo git push origin %tag_name%
  echo.
  echo [演练] GitHub Actions 将随后自动构建并上传 Release 附件。
  pause
  exit /b 0
)

git tag "%tag_name%"
if errorlevel 1 (
  echo [错误] 创建标签失败。
  pause
  exit /b 1
)

git push origin "%tag_name%"
if errorlevel 1 (
  echo [错误] 推送标签失败，请检查网络或仓库权限。
  pause
  exit /b 1
)

echo.
echo 发布命令已提交。
echo 请到 GitHub Actions 查看“发布扩展安装包”工作流进度。
echo 完成后，压缩包会出现在对应版本的 GitHub Release 中。
pause
exit /b 0

:invalid_latest_tag
echo [错误] 最新标签 %latest_tag% 不是标准纯数字版本号，请手动设置 TAG_NAME 后再发布。
pause
exit /b 1
