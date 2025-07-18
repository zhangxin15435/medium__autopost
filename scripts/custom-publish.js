/**
 * 自定义文章发布器
 * 简单易用的Medium文章发布工具（无需官方Token）
 */

const WorkingReversePublisher = require('../lib/working-reverse-publisher');
const fs = require('fs-extra');
const path = require('path');

class CustomPublisher {
    constructor() {
        this.publisher = new WorkingReversePublisher();
    }

    /**
     * 发布单篇文章
     */
    async publishArticle(article) {
        console.log('🚀 初始化发布器...');

        try {
            // 初始化发布器
            await this.publisher.init();
            console.log(`✅ 认证成功 - 用户: ${this.publisher.userInfo.name}`);

            // 发布文章
            console.log(`📝 开始发布文章: ${article.title}`);
            const result = await this.publisher.publishArticle(article);

            console.log('🎉 发布成功！');
            console.log(`📄 标题: ${result.title}`);
            console.log(`🔗 链接: ${result.url}`);
            console.log(`🛠️ 方法: ${result.method}`);
            console.log(`📅 时间: ${result.publishedAt}`);

            if (result.note) {
                console.log(`💡 说明: ${result.note}`);
            }

            return result;

        } catch (error) {
            console.error('❌ 发布失败:', error.message);
            throw error;
        }
    }

    /**
     * 从文件发布文章
     */
    async publishFromFile(filePath) {
        console.log(`📖 从文件读取文章: ${filePath}`);

        try {
            const article = await fs.readJson(filePath);
            return await this.publishArticle(article);
        } catch (error) {
            console.error('❌ 文件读取失败:', error.message);
            throw error;
        }
    }

    /**
     * 批量发布文章
     */
    async publishBatch(articles, delay = 5000) {
        console.log('🚀 初始化批量发布器...');

        try {
            await this.publisher.init();
            console.log(`✅ 认证成功 - 用户: ${this.publisher.userInfo.name}`);

            const results = await this.publisher.publishBatch(articles, { delay });

            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;

            console.log('\n📊 批量发布完成');
            console.log(`✅ 成功: ${successful} 篇`);
            console.log(`❌ 失败: ${failed} 篇`);

            return results;

        } catch (error) {
            console.error('❌ 批量发布失败:', error.message);
            throw error;
        }
    }
}

// 使用示例
async function example() {
    const publisher = new CustomPublisher();

    // 示例文章
    const article = {
        title: '我的第一篇自动发布文章',
        content: `# 欢迎使用逆向分析发布器！

这是一篇通过**逆向分析**技术自动发布到Medium的文章。

## 特点

- ✅ 无需官方API Token
- ✅ 基于Cookie认证
- ✅ 支持批量发布
- ✅ 多种发布策略

## 使用方法

\`\`\`javascript
const publisher = new CustomPublisher();
await publisher.publishArticle(article);
\`\`\`

**发布时间**: ${new Date().toLocaleString('zh-CN')}`,
        tags: ['自动化', 'Medium', '发布'],
        subtitle: '体验无Token自动发布的魅力'
    };

    try {
        await publisher.publishArticle(article);
    } catch (error) {
        console.error('发布示例失败:', error.message);
    }
}

// 命令行参数处理
async function main() {
    const args = process.argv.slice(2);
    const publisher = new CustomPublisher();

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🚀 自定义文章发布器使用说明
=====================================

📋 命令:
  node scripts/custom-publish.js                    # 运行示例
  node scripts/custom-publish.js --file <path>      # 从文件发布
  node scripts/custom-publish.js --help             # 显示帮助

📋 文件格式 (JSON):
{
  "title": "文章标题",
  "content": "文章内容（支持Markdown）",
  "tags": ["标签1", "标签2"],
  "subtitle": "副标题（可选）"
}

📋 前置条件:
  1. 确保 cookies.json 文件存在
  2. Cookie必须是有效的Medium登录状态
  3. 网络连接正常

📋 示例:
  node scripts/custom-publish.js
  node scripts/custom-publish.js --file ./my-article.json
        `);
        return;
    }

    const fileIndex = args.indexOf('--file');
    if (fileIndex !== -1 && args[fileIndex + 1]) {
        // 从文件发布
        const filePath = args[fileIndex + 1];
        try {
            await publisher.publishFromFile(filePath);
        } catch (error) {
            console.error('文件发布失败:', error.message);
            process.exit(1);
        }
    } else {
        // 运行示例
        console.log('🎯 运行发布示例...');
        await example();
    }
}

// 错误处理
process.on('unhandledRejection', (error) => {
    console.error('❌ 未处理的错误:', error.message);
    process.exit(1);
});

// 执行
if (require.main === module) {
    main();
}

module.exports = { CustomPublisher }; 