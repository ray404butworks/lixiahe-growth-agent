@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 24，再重新双击本文件。
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)"
if errorlevel 1 (
  echo 当前 Node.js 版本过低，请升级到24。
  pause
  exit /b 1
)
node scripts\serve-preview.mjs
pause
