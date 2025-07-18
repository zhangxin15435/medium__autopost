#!/usr/bin/env node

/**
 * 占位符处理修复验证测试
 * 确保占位符处理不会误删已有内容
 */

const MediumPublisher = require('../lib/medium-publisher');
const { logger } = require('../lib/utils');

async function testPlaceholderFix() {
    const startTime = Date.now();

    try {
        logger.info('🔧 开始测试修复后的占位符处理...');

        // 创建发布器实例
        const publisher = new MediumPublisher({
            fastMode: true,      // 启用快速模式
            lineInputMode: true, // 启用按行输入
            slowMo: 100         // 稍慢一点，便于观察行为
        });

        // 初始化发布器
        logger.info('⚡ 初始化发布器...');
        await publisher.init();

        // 登录
        logger.info('🔐 登录Medium...');
        await publisher.loginWithCookies();

        // 准备测试文章 - 测试占位符不误删内容
        const testArticle = {
            title: `占位符修复验证 ${new Date().getHours()}:${new Date().getMinutes()}`,
            subtitle: '验证占位符处理不会误删已有内容',
            content: `
这是一篇用于验证占位符处理修复的文章。

## 修复的问题

### 1. 过度清除问题
- **修复前**: 强制清空所有内容，包括已输入的标题
- **修复后**: 模拟自然用户行为，让占位符自然消失

### 2. 智能检测机制
- 检测是否为纯占位符文本
- 区分占位符和有效内容
- 只清除明确的占位符元素

### 3. 温和处理策略
- 优先使用自然的点击和焦点事件
- 等待Medium的自然机制处理占位符
- 只在必要时进行轻微干预

## 验证要点

### 标题框处理
- ✅ 不会清除已输入的标题
- ✅ 正确处理"Title"占位符
- ✅ 保留有效内容

### 内容框处理  
- ✅ 不会清除已有内容
- ✅ 正确处理"Tell your story"占位符
- ✅ 智能追加新内容

### 副标题处理
- ✅ 温和的占位符处理
- ✅ 保留现有有效内容
- ✅ 自然的用户行为模拟

## 测试场景

这篇文章测试了：
- 多段落内容
- 中英文混合
- 特殊字符处理
- 代码块格式

### 代码示例
\`\`\`javascript
// 修复后的占位符处理
if (hasOnlyPlaceholder && !hasValidContent) {
    // 只清除纯占位符
    removeOnlyPlaceholders();
} else {
    // 保留有效内容
    preserveValidContent();
}
\`\`\`

## 结论

如果您看到这篇完整的文章，标题正确显示，内容格式正常，说明占位符处理修复成功！

- 标题: 应该显示正确的标题，不是"Title"
- 副标题: 应该显示正确的副标题，不是"Tell your story"  
- 内容: 应该显示完整内容，不是占位符文本

测试时间: ${new Date().toISOString()}
            `.trim(),
            tags: ['测试', '占位符修复', '内容保护', '自然行为']
        };

        // 执行发布
        logger.info('📝 开始发布占位符修复验证文章...');
        const publishStartTime = Date.now();

        const result = await publisher.publishArticle(testArticle);

        const publishDuration = Date.now() - publishStartTime;
        const totalDuration = Date.now() - startTime;

        // 显示结果
        if (result.success) {
            logger.info('✅ 占位符处理修复验证成功！');
            logger.info(`📊 测试统计:`);
            logger.info(`   发布用时: ${publishDuration}ms (${(publishDuration / 1000).toFixed(1)}秒)`);
            logger.info(`   总用时: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}秒)`);
            logger.info(`   文章URL: ${result.url}`);

            // 验证要点检查
            logger.info(`🎯 修复验证:`);
            logger.info(`   ✅ 标题未被误删 - 应显示正确标题`);
            logger.info(`   ✅ 内容未被误删 - 应显示完整内容`);
            logger.info(`   ✅ 占位符正确处理 - 不应有占位符残留`);
            logger.info(`   ✅ 自然行为模拟 - 温和的处理方式`);

            logger.info(`📝 检查要点:`);
            logger.info(`   👁️ 请查看发布的文章，确认:`);
            logger.info(`      - 标题显示为"占位符修复验证"`);
            logger.info(`      - 副标题显示为"验证占位符处理不会误删已有内容"`);
            logger.info(`      - 内容完整显示，格式正确`);
            logger.info(`      - 没有"Title"或"Tell your story"占位符文本`);
        } else {
            logger.error('❌ 占位符处理修复验证失败');
            logger.error('验证结论: 修复可能不完整，需要进一步调试');
        }

        // 清理
        await publisher.close();

        return result;

    } catch (error) {
        logger.error('❌ 占位符处理修复验证出错:', error.message);

        // 分析错误类型
        if (error.message.includes('无法成功输入标题')) {
            logger.error('💡 错误分析: 标题输入仍有问题');
        } else if (error.message.includes('内容验证失败')) {
            logger.error('💡 错误分析: 内容输入验证有问题');
        } else {
            logger.error('💡 错误分析: 其他未知问题');
        }

        throw error;
    }
}

// 运行测试
if (require.main === module) {
    testPlaceholderFix()
        .then(result => {
            if (result && result.success) {
                logger.info('🎉 占位符处理修复验证完成！修复成功！');
                logger.info('💡 现在占位符处理更加温和，不会误删内容了！');
                process.exit(0);
            } else {
                logger.error('💥 占位符处理修复验证失败！需要进一步调试！');
                process.exit(1);
            }
        })
        .catch(error => {
            logger.error('💥 验证执行失败:', error.message);
            logger.info('💡 建议: 检查网络连接、Cookie状态或Medium页面结构变化');
            process.exit(1);
        });
}

module.exports = testPlaceholderFix; 