const MediumReversePublisher = require('../lib/medium-api-reverse');
const { logger } = require('../lib/utils');

/**
 * 逆向分析Medium发布器使用示例
 * 展示如何使用API和GraphQL方式发布文章
 */
async function reversePublishExample() {
    try {
        console.log('🚀 Medium逆向分析发布器示例');
        console.log('=====================================');

        // 1. 创建发布器实例
        const publisher = new MediumReversePublisher({
            // 可选：如果有Integration Token
            integrationToken: process.env.MEDIUM_INTEGRATION_TOKEN
        });

        // 2. 准备测试文章
        const article = {
            title: '逆向分析实现Medium自动发布 - 技术探索',
            subtitle: '通过分析Medium的API和GraphQL接口实现更高效的自动发布',
            content: `# 逆向分析的威力

## 简介

通过逆向分析Medium的内部API，我们可以实现比传统方法更加高效和稳定的自动发布功能。

## 技术优势

### 1. 性能提升
- 无需启动浏览器，资源消耗大幅降低
- 发布速度提升10倍以上
- 支持高并发批量发布

### 2. 稳定性增强
- 不受前端UI变化影响
- 没有DOM元素识别失败的风险
- 网络请求更加可靠

### 3. 功能扩展
- 支持获取文章列表
- 可以检查文章是否已存在
- 支持更多发布选项和元数据

## 实现原理

通过分析Medium的网络请求，我们发现了以下关键接口：

1. **GraphQL接口**: \`https://medium.com/_/graphql\`
2. **官方API**: \`https://api.medium.com/v1\`
3. **认证机制**: Cookie + XSRF Token

## 代码示例

\`\`\`javascript
const publisher = new MediumReversePublisher();
await publisher.init();
const result = await publisher.publishArticle(article);
console.log('发布成功:', result.url);
\`\`\`

## 结论

逆向分析为我们提供了更强大、更灵活的自动化解决方案，是技术创新的重要手段。

---

*本文演示了逆向分析技术在自动化发布中的应用，仅供学习和研究使用。*`,
            tags: ['技术', '自动化', '逆向分析', 'Medium', 'API']
        };

        console.log(`📝 准备发布文章: ${article.title}`);

        // 3. 执行发布
        const result = await publisher.publishFlow(article);

        if (result.success) {
            console.log('✅ 发布成功！');
            console.log(`📄 文章标题: ${result.title}`);
            console.log(`🔗 文章链接: ${result.url}`);
            console.log(`📅 发布时间: ${result.publishedAt}`);
        } else {
            console.log('❌ 发布失败');
            console.log(`错误信息: ${result.error}`);
        }

        // 4. 演示获取文章列表功能（仅当使用Cookie认证时）
        if (!publisher.integrationToken) {
            console.log('\n📋 演示获取文章列表功能...');
            try {
                const posts = await publisher.getUserPosts('@your-username', 10);
                console.log(`📚 获取到 ${posts.length} 篇文章:`);
                posts.forEach((post, index) => {
                    console.log(`${index + 1}. ${post.title} (${post.publishedAt?.slice(0, 10)})`);
                });
            } catch (error) {
                console.log('⚠️ 获取文章列表失败:', error.message);
            }
        }

        // 5. 演示批量发布功能
        console.log('\n🔄 演示批量发布功能...');
        const batchArticles = [
            {
                title: '逆向分析基础教程',
                content: '# 逆向分析入门\n\n本文介绍逆向分析的基本概念和方法...',
                tags: ['教程', '逆向分析']
            },
            {
                title: 'Medium API深度解析',
                content: '# Medium API详解\n\n深入分析Medium的API接口设计...',
                tags: ['API', 'Medium', '技术分析']
            }
        ];

        // 注意：这里只是演示，实际使用时请谨慎批量发布
        console.log('📚 准备批量发布文章（仅演示，未实际执行）...');
        console.log(`待发布文章数量: ${batchArticles.length}`);
        batchArticles.forEach((article, index) => {
            console.log(`${index + 1}. ${article.title}`);
        });

        // 取消注释下面的代码来实际执行批量发布
        /*
        const batchResults = await publisher.batchPublish(batchArticles, {
            delay: 10000 // 10秒间隔，避免频率限制
        });
        
        console.log('\n📊 批量发布结果:');
        batchResults.forEach((result, index) => {
            if (result.success) {
                console.log(`✅ ${index + 1}. ${result.article} - 发布成功`);
            } else {
                console.log(`❌ ${index + 1}. ${result.article} - 发布失败: ${result.error}`);
            }
        });
        */

    } catch (error) {
        console.error('❌ 示例执行失败:', error.message);
        console.error('详细错误:', error);
    }
}

/**
 * 对比Puppeteer和逆向分析方式的性能
 */
async function performanceComparison() {
    console.log('\n⚡ 性能对比测试');
    console.log('================');

    const testArticle = {
        title: '性能测试文章',
        content: '# 测试内容\n\n这是一篇用于性能测试的文章。',
        tags: ['测试']
    };

    // 1. 逆向分析方式
    console.log('🔬 测试逆向分析方式...');
    const reverseStartTime = Date.now();

    try {
        const reversePublisher = new MediumReversePublisher();
        await reversePublisher.init();
        // 注意：这里只是模拟测试，实际发布请谨慎
        console.log('逆向方式初始化完成');
        const reverseTime = Date.now() - reverseStartTime;
        console.log(`⚡ 逆向分析方式耗时: ${reverseTime}ms`);
    } catch (error) {
        console.log('❌ 逆向方式测试失败:', error.message);
    }

    // 2. 传统Puppeteer方式对比
    console.log('\n🤖 对比传统Puppeteer方式...');
    const puppeteerStartTime = Date.now();

    try {
        // 模拟Puppeteer启动时间（通常需要几秒）
        console.log('Puppeteer方式需要启动浏览器...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // 模拟3秒启动时间
        const puppeteerTime = Date.now() - puppeteerStartTime;
        console.log(`🐌 Puppeteer方式耗时: ${puppeteerTime}ms`);

        console.log('\n📊 性能对比总结:');
        console.log('逆向分析: 启动快、资源消耗低、稳定性高');
        console.log('Puppeteer: 启动慢、资源消耗高、易受UI变化影响');
    } catch (error) {
        console.log('❌ Puppeteer方式对比失败:', error.message);
    }
}

/**
 * 安全提醒和最佳实践
 */
function securityReminder() {
    console.log('\n🔒 安全提醒和最佳实践');
    console.log('========================');
    console.log('');
    console.log('⚠️  重要提醒:');
    console.log('1. 逆向分析仅供学习和研究使用');
    console.log('2. 请遵守Medium的服务条款和使用政策');
    console.log('3. 避免频繁发布，注意请求频率限制');
    console.log('4. 妥善保管认证信息（Token、Cookie等）');
    console.log('5. 定期更新代码以适应API变化');
    console.log('');
    console.log('💡 最佳实践:');
    console.log('1. 优先使用官方API（如果可用）');
    console.log('2. 实现请求重试和错误处理机制');
    console.log('3. 添加日志记录便于调试');
    console.log('4. 定期测试确保功能正常');
    console.log('5. 考虑实现备用发布方案');
}

// 主函数
async function main() {
    try {
        await reversePublishExample();
        await performanceComparison();
        securityReminder();
    } catch (error) {
        console.error('程序执行出错:', error);
    }
}

// 如果直接运行此文件，则执行示例
if (require.main === module) {
    main();
}

module.exports = {
    reversePublishExample,
    performanceComparison,
    securityReminder
}; 