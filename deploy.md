# Medium自动发布系统 - Vercel部署指南

## 🚀 快速部署

### 1. 部署到Vercel

#### 方式一：一键部署
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/medium-autopost)

#### 方式二：命令行部署
```bash
# 安装Vercel CLI
npm i -g vercel

# 登录Vercel
vercel login

# 部署项目
vercel --prod
```

### 2. 环境变量配置

在Vercel Dashboard中设置以下环境变量：

| 变量名 | 说明 | 必需 |
|--------|------|------|
| `OPENAI_API_KEY` | OpenAI API密钥 | ✅ |
| `OPENAI_BASE_URL` | OpenAI API基础URL (可选) | ❌ |
| `API_SECRET_KEY` | API访问密钥 | ✅ |
| `NODE_ENV` | 环境模式 (production) | ✅ |

### 3. 设置定时任务

系统已配置每天上午9点自动发布文章：
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

### 4. API端点

部署后可用的API端点：

- `GET /api/articles` - 获取文章列表
- `POST /api/publish` - 发布单篇文章
- `POST /api/batch-upload` - 批量上传文章
- `POST /api/cron-publish` - 定时发布任务

## 📋 部署前检查

### 必需文件
- ✅ `api/` 目录及其所有文件
- ✅ `lib/` 目录及其所有文件
- ✅ `package.json`
- ✅ `vercel.json`
- ✅ `.gitignore`

### 已清理的文件
- ❌ 调试截图文件 (`debug-screenshot-*.png`)
- ❌ 测试报告文件 (`*-test-*.json`, `*-report-*.json`)
- ❌ 日志文件 (`logs/`)
- ❌ 缓存目录 (`__pycache__/`, `.npm-cache/`, `.specstory/`)
- ❌ 大型文件 (`available_models.json`)

## 🔧 Vercel配置说明

### 函数配置
- **内存限制**: 1024MB (用于Puppeteer)
- **执行时间**: 最长300秒
- **Puppeteer**: 使用云端Chrome浏览器

### 自动化功能
- **定时发布**: 每天上午9点自动执行
- **API访问**: 支持外部API调用
- **文件管理**: 自动处理文章上传和发布

## 📝 使用示例

### 发布单篇文章
```bash
curl -X POST https://your-domain.vercel.app/api/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_SECRET_KEY" \
  -d '{
    "title": "我的文章标题",
    "content": "文章内容...",
    "tags": ["技术", "编程"]
  }'
```

### 批量上传文章
```bash
curl -X POST https://your-domain.vercel.app/api/batch-upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_SECRET_KEY" \
  -d '{
    "articles": [
      {
        "title": "文章1",
        "content": "内容1",
        "tags": ["标签1"]
      }
    ]
  }'
```

## 🛠️ 故障排除

### 常见问题

1. **Puppeteer错误**
   - 确保设置了正确的Chrome路径
   - 检查内存限制是否足够

2. **API调用失败**
   - 验证环境变量设置
   - 检查API密钥是否正确

3. **定时任务不执行**
   - 检查cron表达式格式
   - 确认Vercel Pro账户支持

### 调试方法
查看Vercel Functions日志：
```bash
vercel logs --follow
```

## 📞 支持

如有问题，请检查：
1. Vercel Dashboard中的函数日志
2. 环境变量配置
3. API端点响应

---

**注意**: Vercel免费版有一定的执行时间和调用次数限制，建议升级到Pro版本以获得更好的性能。 