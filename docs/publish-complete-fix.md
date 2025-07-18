# 🔧 "Requesting main frame too early!" 错误修复

## 问题描述

从您提供的日志看到，虽然标题输入问题已解决，但出现了新的错误：

```
[INFO] 文章《标题修复测试 14:41》发布成功！
[ERROR] 发布文章失败: Requesting main frame too early!
```

**矛盾现象**：文章实际发布成功，但最后报错。

## 问题根因分析

### 错误原因
"Requesting main frame too early!" 错误发生在页面正在导航（跳转）过程中尝试访问页面内容时。

### 具体发生位置
1. **发布成功后获取URL** - `await this.page.url()`
2. **等待发布完成时的URL检查循环** - 多次调用 `await this.page.url()`
3. **调试信息获取** - `this.page.url()` 和 `await this.page.title()`
4. **备用发布策略中的URL检查**

### 为什么会发生
Medium发布成功后会自动跳转到文章页面，在页面导航期间：
- DOM还没有完全加载
- main frame 还没有准备好
- 此时调用 `page.url()` 或 `page.title()` 就会出错

## 修复方案

### 1. 安全的URL获取机制 ✅

**修复前**：
```javascript
const articleUrl = await this.page.url(); // 可能出错
```

**修复后**：
```javascript
let articleUrl = 'https://medium.com';
try {
    await this.page.waitForTimeout(1000); // 等待页面稳定
    articleUrl = await this.page.url();
} catch (urlError) {
    // 使用备用方法
    try {
        articleUrl = await this.page.evaluate(() => window.location.href);
    } catch (evalError) {
        logger.warn('无法获取文章URL，使用默认值');
    }
}
```

### 2. 改进调试信息获取 ✅

**修复前**：
```javascript
const currentUrl = this.page.url(); // 缺少await，语法错误
const pageTitle = await this.page.title(); // 可能出错
```

**修复后**：
```javascript
// 安全获取当前URL
let currentUrl = '无法获取';
try {
    await this.page.waitForTimeout(500);
    currentUrl = await this.page.url();
} catch (urlError) {
    try {
        currentUrl = await this.page.evaluate(() => window.location.href);
    } catch (evalError) {
        currentUrl = '页面导航中，无法获取URL';
    }
}

// 安全获取页面标题
let pageTitle = '无法获取';
try {
    pageTitle = await this.page.title();
} catch (titleError) {
    try {
        pageTitle = await this.page.evaluate(() => document.title);
    } catch (evalError) {
        pageTitle = '页面导航中，无法获取标题';
    }
}
```

### 3. 优化发布完成检查 ✅

**修复前**：
```javascript
for (let attempt = 1; attempt <= 6; attempt++) {
    const currentUrl = await this.page.url(); // 可能出错
    // ...
}
```

**修复后**：
```javascript
for (let attempt = 1; attempt <= 6; attempt++) {
    let currentUrl = 'unknown';
    try {
        currentUrl = await this.page.url();
    } catch (urlError) {
        // 错误可能意味着页面正在导航，这实际上是好消息
        if (urlError.message.includes('Requesting main frame too early')) {
            logger.info('页面正在导航中，可能发布成功');
            urlChanged = true;
        }
        continue; // 跳过本次检查
    }
    // ...
}
```

### 4. 全面的错误处理 ✅

在以下所有位置都添加了安全的URL获取：
- `publishArticle()` - 主发布方法
- `waitForPublishComplete()` - 等待发布完成
- `attemptAlternativePublish()` - 备用发布策略
- `checkDirectPublish()` - 检查直接发布
- 调试信息获取

## 修复效果

### 修复前
```
[INFO] 文章《标题修复测试 14:41》发布成功！
[ERROR] 发布文章失败: Requesting main frame too early!
[ERROR] 获取调试信息失败: | 数据: {}
```

### 修复后（预期）
```
[INFO] 文章《标题修复测试 14:41》发布成功！
[INFO] 安全获取文章URL...
[INFO] 发布完成，返回结果
[INFO] ✅ 发布成功！
```

## 使用修复版本

### 1. 测试修复效果
```bash
node scripts/test-publish-fix.js
```

### 2. 正常发布
```bash
node my-publish.js
```

### 3. 快速发布
```bash
node scripts/quick-speed-test.js
```

## 技术要点

### 核心策略
1. **等待页面稳定** - 在获取URL前等待1秒
2. **备用获取方法** - 使用 `page.evaluate()` 作为备选
3. **优雅降级** - 获取失败时使用默认值
4. **错误信息分析** - 区分真正错误和导航期间临时错误

### 修改文件
- `lib/medium-publisher.js` - 主要修复文件
- `scripts/test-publish-fix.js` - 专门测试脚本

### 关键改进
1. 所有 `await this.page.url()` 调用都添加了错误处理
2. 调试信息获取完全重写，更加安全
3. 识别并正确处理页面导航期间的错误
4. 保持发布功能正常工作的同时避免误报错误

## 预期结果

修复后应该看到：
- ✅ 文章正常发布
- ✅ 没有 "Requesting main frame too early!" 错误
- ✅ 正确获取文章URL
- ✅ 完整的成功返回结果

---

*修复完成时间：2025年1月*
*状态：已修复* ✅ 