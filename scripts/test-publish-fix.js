#!/usr/bin/env node

/**
 * 发布后处理错误修复测试
 * 验证修复后的发布完成处理逻辑
 */

const MediumPublisher = require('../lib/medium-publisher');
const { logger } = require('../lib/utils');

async function testPublishCompleteFix() {
    const startTime = Date.now();

    try {
        logger.info('🔧 开始测试发布后处理错误修复...');

        // 创建发布器实例
        const publisher = new MediumPublisher({
            fastMode: true,      // 启用快速模式
            lineInputMode: true, // 启用按行输入
            slowMo: 50          // 适中的延迟
        });

        // 初始化发布器
        logger.info('⚡ 初始化发布器...');
        await publisher.init();

        // 登录
        logger.info('🔐 登录Medium...');
        await publisher.loginWithCookies();

        // 准备测试文章
        const testArticle = {
            title: `发布完成修复测试 ${new Date().getHours()}:${new Date().getMinutes()}`,
            subtitle: '测试修复后的发布完成处理逻辑',
            content: `
这是一篇用于测试发布完成处理错误修复的文章。

## 修复的问题

### 1. "Requesting main frame too early!" 错误
- 在页面导航期间获取URL导致错误
- 修复：添加安全的URL获取机制
- 使用备用方法和错误处理

### 2. 调试信息获取错误
- 在catch块中获取调试信息时出错
- 修复：所有调试信息获取都添加错误处理
- 确保不因调试信息获取失败而影响主流程

### 3. 发布成功但报错的问题
- 文章实际发布成功但返回错误
- 修复：改进错误处理逻辑
- 区分真正的错误和导航期间的临时错误

## 测试时间
${new Date().toISOString()}

如果您看到这篇文章且没有错误，说明发布完成处理修复成功！
            `.trim(),
            tags: ['测试', '修复', '发布处理']
        };

        // 执行发布
        logger.info('📝 开始发布测试文章...');
        const publishStartTime = Date.now();

        const result = await publisher.publishArticle(testArticle);

        const publishDuration = Date.now() - publishStartTime;
        const totalDuration = Date.now() - startTime;

        // 显示结果
        if (result.success) {
            logger.info('✅ 发布完成处理修复测试成功！');
            logger.info(`📊 测试统计:`);
            logger.info(`   发布用时: ${publishDuration}ms (${(publishDuration / 1000).toFixed(1)}秒)`);
            logger.info(`   总用时: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}秒)`);
            logger.info(`   文章URL: ${result.url}`);
            logger.info(`   测试结论: 发布完成处理错误已修复`);

            // 检查是否真的修复了错误
            if (result.url && result.url !== 'https://medium.com') {
                logger.info('🎯 URL获取成功，未出现"Requesting main frame too early"错误');
            } else {
                logger.warn('⚠️ URL获取使用了默认值，但至少没有报错');
            }
        } else {
            logger.error('❌ 发布完成处理修复测试失败');
            logger.error('测试结论: 仍需进一步修复');
        }

        // 清理
        await publisher.close();

        return result;

    } catch (error) {
        logger.error('❌ 发布完成处理修复测试出错:', error.message);

        // 分析错误类型
        if (error.message.includes('Requesting main frame too early')) {
            logger.error('💡 错误分析: "Requesting main frame too early"错误仍然存在');
            logger.error('💡 建议: 需要进一步优化页面导航处理');
        } else if (error.message.includes('发布文章失败')) {
            logger.error('💡 错误分析: 发布流程出现其他错误');
        } else {
            logger.error('💡 错误分析: 其他未知问题');
        }

        throw error;
    }
}

// 运行测试
if (require.main === module) {
    testPublishCompleteFix()
        .then(result => {
            if (result && result.success) {
                logger.info('🎉 发布完成处理修复测试成功！错误已修复！');
                process.exit(0);
            } else {
                logger.error('💥 发布完成处理修复测试失败！需要进一步修复！');
                process.exit(1);
            }
        })
        .catch(error => {
            logger.error('💥 测试执行失败:', error.message);
            logger.info('💡 建议: 检查网络连接、Cookie状态或Medium页面结构变化');
            process.exit(1);
        });
}

module.exports = testPublishCompleteFix; 