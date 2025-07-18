#!/usr/bin/env node

/**
 * 快速发布速度测试
 * 测试优化后的发布器性能
 */

const MediumPublisher = require('../lib/medium-publisher');
const { logger } = require('../lib/utils');

async function testQuickPublish() {
    const startTime = Date.now();

    try {
        logger.info('🚀 开始快速发布速度测试...');

        // 创建优化的发布器实例
        const publisher = new MediumPublisher({
            fastMode: true,      // 启用快速模式
            lineInputMode: true, // 启用按行输入
            slowMo: 25          // 进一步减少延迟
        });

        // 初始化发布器
        logger.info('⚡ 初始化快速发布器...');
        await publisher.init();

        // 登录
        logger.info('🔐 快速登录...');
        await publisher.loginWithCookies();

        // 准备测试文章
        const testArticle = {
            title: `快速发布测试 - ${new Date().toLocaleString()}`,
            subtitle: '测试优化后的发布速度',
            content: `
这是一篇测试文章，用于验证优化后的发布速度。

## 优化内容

### 1. 减少延迟时间
- slowMo从500ms降低到25ms
- 各种waitForTimeout大幅缩短

### 2. 按行输入内容
- 不再逐字符输入
- 改为按行快速输入
- 大幅提升输入效率

### 3. 智能等待策略
- 快速模式下减少不必要的等待
- 只在关键步骤保留最小等待时间

## 测试结果

本次测试于 ${new Date().toISOString()} 执行，
预期发布时间将显著缩短。

如果您看到这篇文章，说明快速发布功能工作正常！

感谢您的耐心等待和反馈。
            `.trim(),
            tags: ['测试', '优化', '快速发布']
        };

        // 执行快速发布
        logger.info('⚡ 开始快速发布...');
        const publishStartTime = Date.now();

        const result = await publisher.publishArticle(testArticle);

        const publishDuration = Date.now() - publishStartTime;
        const totalDuration = Date.now() - startTime;

        // 显示结果
        if (result.success) {
            logger.info('✅ 快速发布测试成功！');
            logger.info(`📊 性能统计:`);
            logger.info(`   发布用时: ${publishDuration}ms (${(publishDuration / 1000).toFixed(1)}秒)`);
            logger.info(`   总用时: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}秒)`);
            logger.info(`   文章URL: ${result.url}`);

            // 性能评估
            if (publishDuration < 15000) {
                logger.info('🏆 优秀！发布速度非常快');
            } else if (publishDuration < 30000) {
                logger.info('👍 良好！发布速度已明显改善');
            } else if (publishDuration < 60000) {
                logger.info('😐 一般，还有进一步优化空间');
            } else {
                logger.info('🐌 较慢，可能需要检查网络或配置');
            }
        } else {
            logger.error('❌ 快速发布测试失败');
        }

        // 清理
        await publisher.close();

        return result;

    } catch (error) {
        logger.error('❌ 快速发布测试出错:', error.message);
        throw error;
    }
}

// 运行测试
if (require.main === module) {
    testQuickPublish()
        .then(result => {
            if (result.success) {
                logger.info('🎉 快速发布测试完成！');
                process.exit(0);
            } else {
                logger.error('💥 快速发布测试失败！');
                process.exit(1);
            }
        })
        .catch(error => {
            logger.error('💥 测试执行失败:', error.message);
            process.exit(1);
        });
}

module.exports = testQuickPublish; 