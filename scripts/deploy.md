# Medium自动发布系统部署指南

## 1. 准备工作

### 1.1 创建Medium账户
- 确保您有Medium账户并记住登录邮箱和密码
- 建议在Medium上先手动发布一篇文章，确保账户正常

### 1.2 准备Vercel账户
- 注册Vercel账户: https://vercel.com
- 安装Vercel CLI: `npm i -g vercel`

## 2. 本地开发设置

### 2.1 克隆项目
```bash
git clone <your-repo-url>
cd medium-autopost
npm install
```

### 2.2 配置环境变量
复制 `.env.example` 为 `.env` 并填写配置：

```bash
# Medium账户配置
MEDIUM_EMAIL=your-email@example.com
MEDIUM_PASSWORD=your-password

# 文章发布配置
MEDIUM_PUBLICATION=
DEFAULT_TAGS=技术,编程,自动化

# 安全配置
API_SECRET_KEY=your-random-secret-key

# Puppeteer配置
PUPPETEER_HEADLESS=true
PUPPETEER_SLOW_MO=100

# 调试配置
DEBUG_MODE=false
LOG_LEVEL=info
```

### 2.3 本地测试
```bash
# 测试系统
node index.js test

# 创建示例文章
node index.js sample

# 查看状态
node index.js status

# 本地开发服务
npm run dev
```

## 3. 部署到Vercel

### 3.1 使用Vercel CLI部署
```bash
# 登录Vercel
vercel login

# 部署项目
vercel

# 添加环境变量
vercel env add MEDIUM_EMAIL
vercel env add MEDIUM_PASSWORD
vercel env add API_SECRET_KEY

# 重新部署
vercel --prod
```

### 3.2 使用GitHub集成

1. 将代码推送到GitHub仓库
2. 在Vercel控制台导入GitHub项目
3. 在项目设置中添加环境变量
4. 部署完成后会自动获得域名

### 3.3 配置Cron任务

Vercel会自动根据 `vercel.json` 中的配置启用Cron任务：

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

这将在每天上午9点（UTC时间）执行自动发布任务。

## 4. 使用API

### 4.1 创建文章
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

### 4.2 立即发布
```bash
curl -X POST https://your-app.vercel.app/api/publish \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{
    "action": "publish",
    "immediate": true,
    "article": {
      "title": "立即发布的文章",
      "content": "这篇文章将立即发布到Medium"
    }
  }'
```

### 4.3 获取文章列表
```bash
curl https://your-app.vercel.app/api/articles?status=pending \
  -H "X-API-Key: your-secret-key"
```

### 4.4 测试系统
```bash
curl -X POST https://your-app.vercel.app/api/publish \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"action": "test"}'
```

## 5. 监控和日志

### 5.1 查看Vercel日志
- 访问Vercel控制台
- 进入项目页面
- 查看Functions标签页的日志

### 5.2 查看Cron执行状态
- 在Vercel控制台的Cron标签页查看执行历史
- 每次执行会在日志中记录详细信息

## 6. 故障排除

### 6.1 常见问题

**问题：登录失败**
- 检查Medium邮箱和密码是否正确
- 确认Medium账户没有启用两步验证
- 检查是否有特殊字符需要转义

**问题：发布失败**
- 检查文章内容是否符合Medium要求
- 确认标签数量不超过5个
- 验证文章标题和内容不为空

**问题：Cron任务不执行**
- 确认时区设置（Vercel使用UTC时间）
- 检查vercel.json中的Cron配置
- 查看Vercel控制台的Cron日志

### 6.2 调试模式

启用调试模式获取更多日志信息：

```bash
# 设置环境变量
DEBUG_MODE=true
LOG_LEVEL=debug
```

## 7. 安全建议

1. 定期更新API密钥
2. 不要在公开仓库中暴露敏感信息
3. 使用强密码保护Medium账户
4. 定期检查发布日志，确认没有异常活动

## 8. 扩展功能

### 8.1 自定义发布时间
修改 `vercel.json` 中的Cron表达式来调整发布时间

### 8.2 支持多个Medium账户
可以扩展代码支持多个账户配置

### 8.3 添加Webhook通知
在发布成功/失败时发送通知到Slack、钉钉等平台

## 9. 更新和维护

### 9.1 更新代码
```bash
git pull origin main
vercel --prod
```

### 9.2 备份数据
定期备份 `articles/` 目录中的文章数据

### 9.3 监控系统状态
建议设置外部监控服务来检查API的可用性 