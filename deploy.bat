@echo off
chcp 65001 >nul
echo 🚀 开始部署 Medium 自动发布系统到 Vercel...

REM 检查是否安装了Vercel CLI
vercel --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 📦 Vercel CLI 未安装，正在安装...
    npm install -g vercel
)

REM 检查是否已登录Vercel
echo 🔐 检查Vercel登录状态...
vercel whoami >nul 2>&1
if %errorlevel% neq 0 (
    echo 📝 请登录Vercel...
    vercel login
)

REM 清理无用文件
echo 🧹 清理无用文件...
if exist debug-screenshot-*.png del /f /q debug-screenshot-*.png
if exist *-test-*.json del /f /q *-test-*.json  
if exist *-report-*.json del /f /q *-report-*.json
if exist demo_test_results_*.json del /f /q demo_test_results_*.json
if exist logs rmdir /s /q logs
if exist __pycache__ rmdir /s /q __pycache__
if exist .npm-cache rmdir /s /q .npm-cache
if exist .specstory rmdir /s /q .specstory

REM 检查必要文件
echo 📋 检查必要文件...
set missing_files=0

if not exist package.json (
    echo ❌ 缺少文件: package.json
    set missing_files=1
)
if not exist vercel.json (
    echo ❌ 缺少文件: vercel.json
    set missing_files=1
)
if not exist api\publish.js (
    echo ❌ 缺少文件: api\publish.js
    set missing_files=1
)
if not exist lib\medium-publisher.js (
    echo ❌ 缺少文件: lib\medium-publisher.js
    set missing_files=1
)

if %missing_files%==1 (
    echo ❌ 请确保所有必要文件都存在
    pause
    exit /b 1
)

echo ✅ 所有必要文件已确认

REM 安装依赖
echo 📦 安装依赖包...
npm install

REM 开始部署
echo 🚀 开始部署到Vercel...
vercel --prod

echo.
echo 🎉 部署完成！
echo.
echo 📝 下一步：
echo 1. 在Vercel Dashboard中设置环境变量：
echo    - OPENAI_API_KEY
echo    - API_SECRET_KEY  
echo    - NODE_ENV=production
echo.
echo 2. 测试API端点：
echo    GET  https://your-domain.vercel.app/api/articles
echo    POST https://your-domain.vercel.app/api/publish
echo.
echo 3. 查看部署日志：
echo    vercel logs --follow
echo.
echo 📚 详细部署指南请查看 deploy.md 文件

pause 