#!/bin/bash

# Medium自动发布系统 - Vercel部署脚本

echo "🚀 开始部署 Medium 自动发布系统到 Vercel..."

# 检查是否安装了Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "📦 Vercel CLI 未安装，正在安装..."
    npm install -g vercel
fi

# 检查是否已登录Vercel
echo "🔐 检查Vercel登录状态..."
if ! vercel whoami &> /dev/null; then
    echo "📝 请登录Vercel..."
    vercel login
fi

# 清理无用文件
echo "🧹 清理无用文件..."
rm -f debug-screenshot-*.png
rm -f *-test-*.json
rm -f *-report-*.json
rm -f demo_test_results_*.json
rm -rf logs/
rm -rf __pycache__/
rm -rf .npm-cache/
rm -rf .specstory/

# 检查必要文件
echo "📋 检查必要文件..."
required_files=("package.json" "vercel.json" "api/publish.js" "lib/medium-publisher.js")
missing_files=()

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -ne 0 ]; then
    echo "❌ 缺少必要文件："
    printf '%s\n' "${missing_files[@]}"
    exit 1
fi

echo "✅ 所有必要文件已确认"

# 安装依赖
echo "📦 安装依赖包..."
npm install

# 开始部署
echo "🚀 开始部署到Vercel..."
vercel --prod

echo ""
echo "🎉 部署完成！"
echo ""
echo "📝 下一步："
echo "1. 在Vercel Dashboard中设置环境变量："
echo "   - OPENAI_API_KEY"
echo "   - API_SECRET_KEY"
echo "   - NODE_ENV=production"
echo ""
echo "2. 测试API端点："
echo "   GET  https://your-domain.vercel.app/api/articles"
echo "   POST https://your-domain.vercel.app/api/publish"
echo ""
echo "3. 查看部署日志："
echo "   vercel logs --follow"
echo ""
echo "📚 详细部署指南请查看 deploy.md 文件" 