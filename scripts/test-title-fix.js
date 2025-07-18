#!/usr/bin/env node

/**
 * 标题输入修复测试
 * 验证修复后的标题输入逻辑
 */

const MediumPublisher = require('../lib/medium-publisher');
const { logger } = require('../lib/utils');

async function testTitleInputFix() {
    const startTime = Date.now();
    
    try {
        logger.info('🔧 开始测试标题输入修复效果...');

        // 创建发布器实例
        const publisher = new MediumPublisher({
            fastMode: true,      // 启用快速模式
            lineInputMode: true, // 启用按行输入
            slowMo: 50          // 适中的延迟，便于观察
        });

        // 初始化发布器
        logger.info('⚡ 初始化发布器...');
        await publisher.init();
        
        // 登录
        logger.info('🔐 登录Medium...');
        await publisher.loginWithCookies();

        // 准备测试文章 - 使用简单标题测试
        const testArticle = {
            title: `标题修复测试 ${new Date().getHours()}:${new Date().getMinutes()}`,
            subtitle: '测试改进的标题输入验证逻辑',
            content: `
这是一篇用于测试标题输入修复效果的文章。

## 修复内容

### 1. 改进验证逻辑
- 更宽松但准确的验证条件
- 处理DOM元素分离情况
- 备用验证机制

### 2. 智能错误处理
- 检测"Node is detached"错误
- 在元素分离时进行页面级验证
- 避免无效的重试

### 3. 优化策略执行
- 成功后立即返回
- 元素分离时尝试重新获取
- 最终验证机制

## 测试时间
${new Date().toISOString()}

如果您看到这篇文章，说明标题输入修复成功！
            `.trim(),
            tags: ['测试', '修复', '标题输入']
        };

        // 执行发布
        logger.info('📝 开始发布测试文章...');
        const publishStartTime = Date.now();
        
        const result = await publisher.publishArticle(testArticle);
        
        const publishDuration = Date.now() - publishStartTime;
        const totalDuration = Date.now() - startTime;

        // 显示结果
        if (result.success) {
            logger.info('✅ 标题输入修复测试成功！');
            logger.info(`📊 测试统计:`);
            logger.info(`   发布用时: ${publishDuration}ms (${(publishDuration/1000).toFixed(1)}秒)`);
            logger.info(`   总用时: ${totalDuration}ms (${(totalDuration/1000).toFixed(1)}秒)`);
            logger.info(`   文章URL: ${result.url}`);
            logger.info(`   测试结论: 标题输入逻辑修复成功`);
        } else {
            logger.error('❌ 标题输入修复测试失败');
            logger.error('测试结论: 仍需进一步修复');
        }

        // 清理
        await publisher.close();

        return result;

    } catch (error) {
        logger.error('❌ 标题输入修复测试出错:', error.message);
        
        // 分析错误类型
        if (error.message.includes('detached from document')) {
            logger.error('💡 错误分析: 仍然存在元素分离问题，需要进一步优化');
        } else if (error.message.includes('无法成功输入标题')) {
            logger.error('💡 错误分析: 验证逻辑仍需改进');
        } else {
            logger.error('💡 错误分析: 其他未知问题');
        }
        
        throw error;
    }
}

// 运行测试
if (require.main === module) {
    testTitleInputFix()
        .then(result => {
            if (result && result.success) {
                logger.info('🎉 标题输入修复测试完成！修复成功！');
                process.exit(0);
            } else {
                logger.error('💥 标题输入修复测试失败！需要进一步修复！');
                process.exit(1);
            }
        })
        .catch(error => {
            logger.error('💥 测试执行失败:', error.message);
            logger.info('💡 建议: 检查网络连接、Cookie状态或Medium页面结构变化');
            process.exit(1);
        });
}

module.exports = testTitleInputFix; 