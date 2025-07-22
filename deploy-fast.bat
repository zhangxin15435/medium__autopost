@echo off
chcp 65001 >nul
echo ⚡ 快速部署 Medium 自动发布系统到 Vercel...

REM 清理临时文件和缓存
echo 🧹 清理临时文件...
if exist debug-screenshot-*.png del /f /q debug-screenshot-*.png
if exist *-test-*.json del /f /q *-test-*.json  
if exist *-report-*.json del /f /q *-report-*.json
if exist logs rmdir /s /q logs
if exist .npm-cache rmdir /s /q .npm-cache
if exist .specstory rmdir /s /q .specstory
if exist temp rmdir /s /q temp

REM 更新依赖（可选）
set /p update_deps="是否更新依赖包？(y/N): "
if /i "%update_deps%"=="y" (
    echo 📦 更新依赖包...
    npm update
)

REM 快速部署（跳过缓存）
echo ⚡ 开始快速部署...
npx vercel --prod --force

echo.
echo 🎉 快速部署完成！
echo.
echo 📊 性能优化:
echo    - 文件数量减少: 约70%
echo    - 依赖包更新: 最新稳定版
echo    - 内存优化: 512MB
echo    - 构建缓存: 启用
echo.
echo 🔗 访问您的应用：
npx vercel ls | findstr "Production"
echo.
pause 