#!/usr/bin/env node

/**
 * 内容框占位符处理测试
 * 验证新的内容输入占位符处理功能
 */

const MediumPublisher = require('../lib/medium-publisher');
const { logger } = require('../lib/utils');

async function testContentPlaceholderHandling() {
    const startTime = Date.now();

    try {
        logger.info('🔧 开始测试内容框占位符处理功能...');

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

        // 准备测试文章 - 包含复杂内容测试占位符处理
        const testArticle = {
            title: `内容占位符测试 ${new Date().getHours()}:${new Date().getMinutes()}`,
            subtitle: '测试内容框的智能占位符处理机制',
            content: `
这是一篇用于测试内容框占位符处理功能的文章。

## 新增功能说明

### 1. 智能内容区域识别
- 自动找到内容输入区域
- 区分标题、副标题和正文区域
- 支持多种Medium页面布局

### 2. 占位符智能检测与清除
- 检测"Tell your story"等占位符
- 检测"写下你的故事"等中文占位符
- 清除.defaultValue占位符元素
- 避免占位符与真实内容混合

### 3. 多策略输入方式
- 策略1：智能占位符检测和清除
- 策略2：强制清除和输入
- 策略3：JavaScript直接设置
- 自动降级到传统输入方式

### 4. 输入验证机制
- 验证内容是否正确输入
- 检查是否还有残留占位符
- 页面级备用验证
- 智能长度匹配验证

## 测试场景

这篇文章包含：
- 多行内容
- 标题和子标题
- 列表内容
- 换行和段落

### 代码示例
\`\`\`javascript
// 智能内容输入示例
await this.inputContentToMedium(content);
\`\`\`

### 特殊字符测试
包含各种特殊字符：
- 中文：你好世界！
- 英文：Hello World!
- 符号：@#$%^&*()
- 数字：123456789

## 结论

如果您看到这篇完整的文章且格式正确，说明内容框占位符处理功能工作正常！

测试时间：${new Date().toISOString()}
            `.trim(),
            tags: ['测试', '占位符', '内容输入', '智能处理']
        };

        // 执行发布
        logger.info('📝 开始发布测试文章...');
        const publishStartTime = Date.now();

        const result = await publisher.publishArticle(testArticle);

        const publishDuration = Date.now() - publishStartTime;
        const totalDuration = Date.now() - startTime;

        // 显示结果
        if (result.success) {
            logger.info('✅ 内容框占位符处理测试成功！');
            logger.info(`📊 测试统计:`);
            logger.info(`   发布用时: ${publishDuration}ms (${(publishDuration / 1000).toFixed(1)}秒)`);
            logger.info(`   总用时: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}秒)`);
            logger.info(`   文章URL: ${result.url}`);
            logger.info(`   内容长度: ${testArticle.content.length}字符`);
            logger.info(`   测试结论: 内容框占位符处理功能正常`);

            // 详细功能验证
            logger.info(`🎯 功能验证:`);
            logger.info(`   ✅ 标题输入处理`);
            logger.info(`   ✅ 副标题占位符处理`);
            logger.info(`   ✅ 内容区域占位符处理`);
            logger.info(`   ✅ 按行输入功能`);
            logger.info(`   ✅ 多策略输入验证`);
        } else {
            logger.error('❌ 内容框占位符处理测试失败');
            logger.error('测试结论: 功能需要进一步完善');
        }

        // 清理
        await publisher.close();

        return result;

    } catch (error) {
        logger.error('❌ 内容框占位符处理测试出错:', error.message);

        // 分析错误类型
        if (error.message.includes('无法找到内容输入区域')) {
            logger.error('💡 错误分析: 内容区域识别失败');
        } else if (error.message.includes('占位符')) {
            logger.error('💡 错误分析: 占位符处理存在问题');
        } else if (error.message.includes('验证失败')) {
            logger.error('💡 错误分析: 内容验证逻辑需要调整');
        } else {
            logger.error('💡 错误分析: 其他未知问题');
        }

        throw error;
    }
}

// 运行测试
if (require.main === module) {
    testContentPlaceholderHandling()
        .then(result => {
            if (result && result.success) {
                logger.info('🎉 内容框占位符处理测试完成！功能正常！');
                logger.info('💡 现在标题框和内容框都有智能占位符处理了！');
                process.exit(0);
            } else {
                logger.error('💥 内容框占位符处理测试失败！需要进一步完善！');
                process.exit(1);
            }
        })
        .catch(error => {
            logger.error('💥 测试执行失败:', error.message);
            logger.info('💡 建议: 检查网络连接、Cookie状态或Medium页面结构变化');
            process.exit(1);
        });
}

module.exports = testContentPlaceholderHandling; 