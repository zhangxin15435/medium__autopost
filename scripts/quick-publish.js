const HybridPublisher = require('../lib/hybrid-publisher');

/**
 * 快速发布文章示例
 */
async function quickPublish() {
    try {
        // 1. 创建智能混合发布器
        const publisher = new HybridPublisher({
            strategy: 'auto',        // 自动选择最佳方式
            preferReverse: true,     // 优先使用逆向分析
            enableFallback: true     // 失败时自动回退到Puppeteer
        });

        // 2. 准备你的文章
        const article = {
            title: '我的第一篇自动发布文章',
            subtitle: '使用逆向分析技术实现的自动发布', // 可选
            content: `# 欢迎使用Medium自动发布系统

## 这是什么？

这篇文章是通过**逆向分析技术**自动发布到Medium的，展示了现代自动化技术的强大能力。

## 主要特点

- 🚀 **高性能**: 比传统方法快10倍
- 🛡️ **高稳定性**: 不受界面变化影响  
- 🧠 **智能化**: 自动选择最优发布方式
- 🔧 **易使用**: 简单的API调用

## 使用方法

\`\`\`javascript
const publisher = new HybridPublisher();
const result = await publisher.publishFlow(article);
console.log('发布成功:', result.url);
\`\`\`

## 结论

逆向分析技术为内容创作者提供了强大的自动化工具，让发布变得更加简单高效！

---

*本文由Medium逆向分析自动发布系统生成 - ${new Date().toLocaleString()}*`,
            tags: ['自动化', 'Medium', '技术', '逆向分析', '发布工具']
        };

        console.log('🚀 开始发布文章...');
        console.log(`📄 标题: ${article.title}`);
        console.log(`📝 内容长度: ${article.content.length} 字符`);
        console.log(`🏷️  标签: [${article.tags.join(', ')}]`);
        console.log('');

        // 3. 执行发布
        const startTime = Date.now();
        const result = await publisher.publishFlow(article);
        const duration = Date.now() - startTime;

        // 4. 显示结果
        if (result.success) {
            console.log('🎉 发布成功！');
            console.log(`📄 文章标题: ${result.title}`);
            console.log(`🔗 文章链接: ${result.url}`);
            console.log(`⚙️  发布方式: ${result.publisherType}`);
            console.log(`⏱️  总耗时: ${duration}ms`);
            console.log(`🔄 尝试次数: ${result.attempts || 1}`);

            return result;
        } else {
            throw new Error('发布失败');
        }

    } catch (error) {
        console.error('❌ 发布失败:', error.message);
        console.log('\n🔧 可能的解决方案:');
        console.log('1. 检查网络连接');
        console.log('2. 确认Cookie是否有效');
        console.log('3. 运行 npm run test:smart 检查系统状态');
        throw error;
    }
}

// 直接运行
if (require.main === module) {
    quickPublish().catch(console.error);
}

module.exports = { quickPublish }; 