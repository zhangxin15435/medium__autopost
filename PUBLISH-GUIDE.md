# 📖 Medium自动发布使用指南

基于逆向分析技术的无Token发布方案

## 🔧 前置准备

### 1. 检查Cookie文件
```bash
# 确认cookies.json文件存在
ls cookies.json
```

如果文件不存在，需要：
1. 浏览器登录 Medium.com
2. 按F12打开开发者工具
3. 转到 Application → Storage → Cookies → https://medium.com
4. 复制所有Cookie保存为 `cookies.json` 格式

### 2. 验证环境
```bash
# 确认Node.js和依赖
node --version
npm list
```

## 🚀 发布方式

### 方式1: 快速演示发布
```bash
# 运行预设的演示文章
node scripts/reverse-only-publish.js --demo
```

**特点**：内置测试文章，快速验证功能

### 方式2: 自定义文章发布
```bash
# 发布示例文章
node scripts/custom-publish.js

# 从文件发布
node scripts/custom-publish.js --file example-article.json

# 查看帮助
node scripts/custom-publish.js --help
```

**特点**：灵活自定义，支持文件输入

### 方式3: 完整测试发布
```bash
# 运行完整测试套件（3篇文章）
node scripts/test-working-publisher.js
```

**特点**：测试所有功能，包含批量发布

## 📝 文章格式

### JSON格式示例
```json
{
  "title": "文章标题",
  "subtitle": "副标题（可选）",
  "content": "# 主标题\n\n文章内容支持**Markdown**格式\n\n- 列表项1\n- 列表项2",
  "tags": ["标签1", "标签2", "标签3"]
}
```

### 内容编写要点
- **标题**：简洁明了，吸引读者
- **内容**：支持完整Markdown语法
- **标签**：最多5个，有助于文章发现
- **副标题**：可选，提供额外描述

## 🔄 发布流程

```
1. 初始化发布器
   ↓
2. Cookie认证
   ↓
3. 获取用户信息
   ↓
4. 尝试发布方法:
   - GraphQL API
   - 轻量级API  
   - 元数据API组合
   - 模拟发布（备用）
   ↓
5. 返回发布结果
```

## 📊 发布状态说明

### 成功状态
- ✅ **GraphQL** - 使用GraphQL API成功发布
- ✅ **LiteAPI** - 使用轻量级API成功发布  
- ✅ **MetadataCombo** - 使用元数据API组合成功发布
- ✅ **Simulation** - 模拟发布成功（演示模式）

### 错误状态
- ❌ **400** - 请求参数错误
- ❌ **401/403** - 认证失败
- ❌ **429** - 请求频率限制
- ❌ **500** - 服务器内部错误

## 🛠️ 故障排除

### Cookie相关问题

**问题**: 未找到Cookie文件
```bash
❌ 未找到Cookie文件
```
**解决**: 重新导出Cookie并保存为cookies.json

**问题**: Cookie已过期
```bash
❌ 用户认证失败
```
**解决**: 重新登录Medium并更新Cookie

### 发布限制问题

**问题**: 429频率限制
```bash
❌ Request failed with status code 429
```
**解决**: 等待一段时间后重试，或增加发布间隔

**问题**: 所有API方法都失败
```bash
❌ 所有API方式都失败了
```
**解决**: 检查网络连接，确认Cookie有效性

### 网络连接问题

**问题**: 网络超时
```bash
❌ Request failed with status code ECONNRESET
```
**解决**: 检查网络连接，尝试使用代理

## 📋 高级用法

### 批量发布
```javascript
const { CustomPublisher } = require('./scripts/custom-publish');

const publisher = new CustomPublisher();
const articles = [
  { title: "文章1", content: "内容1", tags: ["tag1"] },
  { title: "文章2", content: "内容2", tags: ["tag2"] }
];

await publisher.publishBatch(articles, 5000); // 5秒间隔
```

### 编程接口
```javascript
const WorkingReversePublisher = require('./lib/working-reverse-publisher');

const publisher = new WorkingReversePublisher();
await publisher.init();

const result = await publisher.publishArticle({
  title: "我的文章",
  content: "文章内容",
  tags: ["标签1", "标签2"]
});

console.log(result.url); // 文章链接
```

## 🎯 最佳实践

### 发布频率
- **单篇发布**: 随时可用
- **批量发布**: 建议间隔5-10秒
- **大量发布**: 分批进行，避免触发限制

### 内容质量
- 确保内容原创性
- 使用恰当的标签
- 格式化良好的Markdown

### 安全考虑
- 定期更新Cookie
- 不要分享Cookie文件
- 遵守Medium社区准则

## 📞 技术支持

### 查看日志
发布过程中的详细日志会显示在控制台，包含：
- 认证状态
- API调用详情
- 错误信息
- 成功结果

### 生成报告
大部分脚本会自动生成详细的JSON报告文件：
- `working-publisher-test-*.json` - 测试报告
- `api-discovery-report-*.json` - API发现报告
- `precise-test-report-*.json` - 精确测试报告

### 调试模式
```bash
# 启用详细日志
DEBUG=* node scripts/custom-publish.js
```

---

🎉 **恭喜！您现在可以在没有官方API Token的情况下，实现Medium文章的完全自动化发布！** 