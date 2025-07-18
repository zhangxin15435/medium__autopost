# 文章上传发布使用指南

## 🚀 方式一：API直接发布 (推荐)

### 单篇文章发布
```bash
curl -X POST https://your-domain.vercel.app/api/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_SECRET_KEY" \
  -d '{
    "title": "提升工作效率: 10个实用方法", 
    "content": "在现代职场中，高效率工作已成为取得成功的重要技能之一。面对日益增长的任务量和紧迫的时间节点，如何有效地提升工作效率，成为每一位职场人士关注的话题。本文将为你介绍10个实用的方法，助你在工作中事半功倍。\n\n## 1. 制定明确的目标\n\n设定具体、可衡量的目标是提高效率的第一步。使用SMART原则（具体、可衡量、可实现、相关、有时限）来制定你的工作目标。\n\n## 2. 时间管理技巧\n\n采用番茄工作法、时间分块等技巧，合理安排工作时间，避免拖延症的影响。",
    "tags": ["工作效率", "时间管理", "职场技能"],
    "subtitle": "掌握这些技巧，让你的工作更高效"
  }'
```

### 批量文章上传
```bash
curl -X POST https://your-domain.vercel.app/api/batch-upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_SECRET_KEY" \
  -d '{
    "articles": [
      {
        "title": "文章标题1",
        "content": "文章内容1...",
        "tags": ["标签1", "标签2"],
        "scheduledTime": "2025-01-20T09:00:00Z"
      },
      {
        "title": "文章标题2", 
        "content": "文章内容2...",
        "tags": ["标签3", "标签4"],
        "scheduledTime": "2025-01-21T09:00:00Z"
      }
    ]
  }'
```

## 📋 方式二：CSV文件批量上传

### 1. 准备CSV文件
创建 `my-articles.csv` 文件：

```csv
title,content,tags,scheduledTime
"如何提高工作效率","在现代职场中，高效率工作已成为取得成功的重要技能...","工作效率,时间管理,职场技能","2025-01-20T09:00:00Z"
"学习新技能的方法","持续学习是保持竞争力的关键...","学习方法,技能提升,个人发展","2025-01-21T09:00:00Z"
```

### 2. 本地批量处理
```bash
# 处理CSV文件中的文章
node index.js batch my-articles.csv

# 选择性发布第1篇文章  
node index.js select my-articles.csv 1

# 可视化模式发布
node index.js visual my-articles.csv 1
```

## ⚡ 方式三：手动即时发布

### 使用Node.js本地发布
```javascript
// publish-article.js
const { MediumPublisher } = require('./lib/medium-publisher');

async function publishArticle() {
    const publisher = new MediumPublisher();
    
    const article = {
        title: "我的新文章",
        content: "这里是文章内容...",
        tags: ["技术", "编程"],
        subtitle: "副标题（可选）"
    };
    
    try {
        await publisher.init();
        const result = await publisher.publishArticle(article);
        console.log('发布成功:', result);
    } catch (error) {
        console.error('发布失败:', error);
    }
}

publishArticle();
```

运行发布：
```bash
node publish-article.js
```

## 🕐 方式四：定时自动发布

### 1. 上传待发布文章
将文章JSON文件放入 `articles/drafts/` 目录：

```json
// articles/drafts/article-001.json
{
  "title": "我的定时文章",
  "content": "文章内容...",
  "tags": ["标签1", "标签2"],
  "scheduledTime": "2025-01-20T09:00:00Z",
  "status": "pending"
}
```

### 2. 系统自动发布
- 系统每天上午9点自动扫描 `drafts` 目录
- 自动发布到达预定时间的文章
- 发布后移动到 `published` 目录

## 🧪 本地测试发布

### 测试环境设置
```bash
# 复制环境变量模板
cp env.example.txt .env

# 编辑环境变量
# OPENAI_API_KEY=your_openai_key
# API_SECRET_KEY=your_secret_key
```

### 可视化测试模式
```bash
# 可视化模式，可以看到浏览器操作过程
node index.js visual my-articles.csv 1

# 选择特定文章测试
node index.js select my-articles.csv 2
```

## 📊 API响应示例

### 成功响应
```json
{
  "success": true,
  "message": "文章发布成功",
  "data": {
    "id": "article_123456",
    "title": "提升工作效率: 10个实用方法",
    "url": "https://medium.com/@username/article-url",
    "publishedAt": "2025-01-18T10:30:00Z",
    "tags": ["工作效率", "时间管理", "职场技能"]
  }
}
```

### 错误响应
```json
{
  "success": false,
  "error": "文章标题不能为空",
  "code": "VALIDATION_ERROR"
}
```

## 🔧 高级功能

### AI内容增强

**新的AI增强策略：**
- **文件上传时增强**：CSV、XLSX文件上传时自动进行AI增强（默认启用）
- **API发布时增强**：仅在明确要求时才进行AI增强（默认关闭）

#### 文件上传时控制AI增强：
```bash
curl -X POST https://your-domain.vercel.app/api/batch-upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_SECRET_KEY" \
  -d '{
    "filePath": "/path/to/file.csv",
    "options": {
      "enableAIEnhancement": true  // 控制是否在上传时AI增强
    }
  }'
```

#### API发布时请求AI增强：
```bash
curl -X POST https://your-domain.vercel.app/api/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_SECRET_KEY" \
  -d '{
    "action": "publish",
    "article": {
      "title": "原始标题",
      "content": "原始内容..."
    },
    "immediate": true,
    "enhanceWithAI": true  // 明确要求AI增强
  }'
```

### 文章模板使用
```bash
# 使用预定义模板
curl -X POST https://your-domain.vercel.app/api/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_SECRET_KEY" \
  -d '{
    "template": "tech-article",
    "title": "技术文章标题",
    "content": "技术内容..."
  }'
```

## 📝 最佳实践

### 文章格式建议
1. **标题**: 简洁有力，50字以内
2. **内容**: 使用Markdown格式，段落清晰
3. **标签**: 3-5个相关标签，有助于文章发现
4. **时间**: 建议在工作日上午9-11点发布

### AI增强策略
1. **文件上传时增强**: 推荐在CSV/XLSX上传时启用AI增强，一次性优化所有文章
2. **API发布适度使用**: 只在需要临时优化单篇文章时使用API级AI增强
3. **内容质量**: AI增强后仍需人工审核，确保内容质量和准确性
4. **性能考虑**: 大批量文章建议分批上传，避免AI处理超时

### 内容优化技巧
1. **开头吸引人**: 用问题或故事开头
2. **结构清晰**: 使用标题和子标题
3. **适当长度**: 800-2000字最佳
4. **图片配合**: 添加相关图片增强视觉效果

### 标签选择
- 使用热门但不过度饱和的标签
- 结合通用标签和细分标签
- 避免过于宽泛的标签

## 🛠️ 故障排除

### 常见问题
1. **401 Unauthorized**: 检查API密钥是否正确
2. **文章发布失败**: 检查Medium登录状态和网络连接
3. **标签添加失败**: Medium界面可能更新，系统会自动适配

### 调试方法
```bash
# 查看详细日志
node index.js visual my-articles.csv 1

# 检查API状态
curl https://your-domain.vercel.app/api/articles
```

---

选择最适合您的方式开始发布文章吧！推荐使用API方式，简单快捷且功能完整。 