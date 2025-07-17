# Medium 文章定时自动发布系统

基于 **Vercel + Cron + Puppeteer + Node.js** 实现的 Medium 文章定时自动发布系统。支持定时任务、手动发布、文章管理等功能。

![系统架构](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Puppeteer](https://img.shields.io/badge/Puppeteer-40B5A8?style=for-the-badge&logo=google-chrome&logoColor=white)

## 🚀 功能特性

### 核心功能
- ✅ **定时自动发布** - 基于 Vercel Cron 的定时任务
- ✅ **手动即时发布** - 支持通过 API 立即发布文章
- ✅ **文章队列管理** - 完整的文章 CRUD 操作
- ✅ **智能调度** - 根据预设时间自动发布
- ✅ **错误处理** - 完善的错误处理和重试机制

### 技术特性
- 🔧 **无服务器架构** - 基于 Vercel 零运维部署
- 🎯 **浏览器自动化** - 使用 Puppeteer 模拟真实用户操作
- 📱 **RESTful API** - 完整的 API 接口支持
- 📊 **日志记录** - 详细的操作日志和错误追踪
- 🔒 **安全认证** - API 密钥保护和访问控制

### 管理功能
- 📝 **文章模板** - 预定义的文章格式模板
- 🏷️ **标签管理** - 自动添加文章标签
- ⏰ **时间调度** - 灵活的发布时间设置
- 📈 **状态监控** - 实时查看发布状态和历史记录

## 📋 目录结构

```
medium-autopost/
├── api/                    # Vercel API 路由
│   ├── cron-publish.js    # Cron 定时任务
│   ├── publish.js         # 手动发布 API
│   └── articles.js        # 文章管理 API
├── lib/                   # 核心库
│   ├── medium-publisher.js # Medium 发布器
│   └── utils.js           # 工具函数库
├── articles/              # 文章存储
│   ├── drafts/           # 待发布文章
│   ├── published/        # 已发布文章
│   └── templates/        # 文章模板
├── scripts/              # 脚本和文档
│   └── deploy.md         # 部署指南
├── test/                 # 测试文件
│   └── test.js          # 系统测试
├── package.json          # 项目配置
├── vercel.json          # Vercel 配置
├── index.js             # 主入口文件
└── README.md            # 项目文档
```

## 🛠️ 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone <your-repo-url>
cd medium-autopost

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
```

### 2. 环境变量配置

编辑 `.env` 文件：

```bash
# Medium账户配置
MEDIUM_EMAIL=your-email@example.com
MEDIUM_PASSWORD=your-password

# 安全配置
API_SECRET_KEY=your-random-secret-key

# Puppeteer配置
PUPPETEER_HEADLESS=true
PUPPETEER_SLOW_MO=100

# 调试配置
DEBUG_MODE=false
LOG_LEVEL=info
```

### 3. 本地测试

```bash
# 系统测试
npm test

# 测试Medium连接
node index.js test

# 创建示例文章
node index.js sample

# 查看系统状态
node index.js status

# 本地开发服务器
npm run dev
```

### 4. 部署到Vercel

```bash
# 安装Vercel CLI
npm i -g vercel

# 登录并部署
vercel login
vercel

# 配置环境变量
vercel env add MEDIUM_EMAIL
vercel env add MEDIUM_PASSWORD
vercel env add API_SECRET_KEY

# 生产部署
vercel --prod
```

## 📚 API 使用指南

### 基础URL
```
https://your-app.vercel.app
```

### 1. 创建文章

```bash
curl -X POST https://your-app.vercel.app/api/articles \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{
    "article": {
      "title": "我的新文章",
      "content": "文章内容...",
      "tags": ["技术", "编程"],
      "scheduledTime": "2024-12-13T09:00:00.000Z"
    }
  }'
```

### 2. 立即发布

```bash
curl -X POST https://your-app.vercel.app/api/publish \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{
    "action": "publish",
    "immediate": true,
    "article": {
      "title": "立即发布的文章",
      "content": "这篇文章将立即发布到Medium",
      "tags": ["即时发布"]
    }
  }'
```

### 3. 获取文章列表

```bash
curl https://your-app.vercel.app/api/articles \
  -H "X-API-Key: your-secret-key"
```

### 4. 系统测试

```bash
curl -X POST https://your-app.vercel.app/api/publish \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"action": "test"}'
```

## ⚙️ 定时任务配置

系统默认配置为每天上午9点（UTC时间）执行定时发布任务：

```json
{
  "crons": [
    {
      "path": "/api/cron-publish",
      "schedule": "0 9 * * *"
    }
  ]
}
```

### 自定义发布时间

修改 `vercel.json` 中的 `schedule` 字段：

```json
"schedule": "0 14 * * *"  // 每天下午2点（UTC）
"schedule": "0 9 * * 1"   // 每周一上午9点
"schedule": "0 9 1 * *"   // 每月1号上午9点
```

## 📝 文章模板

### 标准文章模板

```json
{
  "title": "您的文章标题",
  "subtitle": "文章副标题（可选）",
  "content": "文章正文内容...",
  "tags": ["技术", "编程", "教程"],
  "scheduledTime": "2024-12-13T09:00:00.000Z",
  "status": "pending"
}
```

### 快速发布模板

```json
{
  "title": "快速发布文章",
  "content": "简短的内容...",
  "tags": ["随笔"],
  "status": "pending"
}
```

## 🔧 命令行工具

### 可用命令

```bash
node index.js test      # 测试Medium连接
node index.js sample    # 创建示例文章
node index.js publish   # 发布所有待发布文章
node index.js status    # 显示系统状态
```

### 测试命令

```bash
npm test                # 运行完整测试套件
npm run test quick      # 快速测试
npm run test performance # 性能测试
```

## 📊 监控和日志

### Vercel控制台
- 访问 [Vercel Dashboard](https://vercel.com/dashboard)
- 查看Functions日志和Cron执行历史
- 监控API调用统计

### 本地日志
- 日志文件存储在 `logs/` 目录
- 按日期分组：`YYYY-MM-DD.log`
- 支持不同日志级别：info, warn, error, debug

## 🛡️ 安全最佳实践

### 1. 环境变量保护
- 不要在代码中硬编码敏感信息
- 使用强随机密钥作为API_SECRET_KEY
- 定期轮换密码和密钥

### 2. API访问控制
- 所有API调用都需要有效的API密钥
- 实施请求频率限制
- 记录所有API访问日志

### 3. Medium账户安全
- 使用专用密码
- 避免启用两步验证（会影响自动化）
- 定期检查账户活动

## 🔍 故障排除

### 常见问题

**问题：登录失败**
```
解决方案：
1. 检查Medium邮箱和密码是否正确
2. 确认没有启用两步验证
3. 检查网络连接
```

**问题：发布失败**
```
解决方案：
1. 验证文章内容格式
2. 检查标签数量（不超过5个）
3. 确认标题和内容不为空
```

**问题：Cron任务不执行**
```
解决方案：
1. 检查Vercel控制台的Cron配置
2. 确认时区设置（Vercel使用UTC）
3. 查看函数执行日志
```

### 调试模式

启用详细日志：

```bash
DEBUG_MODE=true
LOG_LEVEL=debug
```

## 🚀 扩展功能

### 计划中的功能
- [ ] 支持多个Medium账户
- [ ] 文章草稿自动保存
- [ ] Webhook通知集成
- [ ] 图片自动上传
- [ ] 文章数据分析
- [ ] 批量导入功能

### 自定义扩展
- 修改发布器以支持其他平台
- 添加更多文章模板
- 集成第三方通知服务
- 实现文章内容生成

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证。详情请见 [LICENSE](LICENSE) 文件。

## 📞 支持与反馈

- 🐛 [报告Bug](https://github.com/your-username/medium-autopost/issues)
- 💡 [功能请求](https://github.com/your-username/medium-autopost/issues)
- 📧 邮件：your-email@example.com

---

**⭐ 如果这个项目对您有帮助，请给个Star支持一下！** 