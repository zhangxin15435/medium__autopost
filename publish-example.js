#!/usr/bin/env node

/**
 * Medium文章发布示例脚本
 * 使用方法: node publish-example.js
 */

require('dotenv').config();
const MediumPublisher = require('./lib/medium-publisher');

// 示例文章数据
const sampleArticles = [
    {
        title: "提升工作效率: 10个实用方法",
        subtitle: "掌握这些技巧，让你的工作更高效",
        content: `
在现代职场中，高效率工作已成为取得成功的重要技能之一。面对日益增长的任务量和紧迫的时间节点，如何有效地提升工作效率，成为每一位职场人士关注的话题。

## 1. 制定明确的目标

设定具体、可衡量的目标是提高效率的第一步。使用SMART原则（具体、可衡量、可实现、相关、有时限）来制定你的工作目标。

## 2. 时间管理技巧

采用番茄工作法、时间分块等技巧，合理安排工作时间，避免拖延症的影响。

## 3. 优先级排序

学会区分紧急和重要的任务，使用艾森豪威尔矩阵来安排工作优先级。

## 4. 避免多任务处理

专注于一件事情，避免频繁切换任务带来的效率损失。

## 5. 利用技术工具

善用各种生产力工具，如任务管理软件、自动化工具等。

## 6. 保持健康的工作节奏

合理安排休息时间，保持身心健康是高效工作的基础。

## 7. 持续学习和改进

不断学习新的工作方法和技能，持续优化自己的工作流程。

## 8. 有效沟通

提高沟通效率，减少不必要的会议和邮件往来。

## 9. 建立良好的工作环境

创造一个有利于集中注意力的工作空间。

## 10. 定期反思和调整

定期回顾工作效果，及时调整工作方法和策略。

通过实践这些方法，你将能够显著提升工作效率，在职场中获得更好的表现。
        `.trim(),
        tags: ["工作效率", "时间管理", "职场技能"]
    },
    {
        title: "学习新技能的有效方法",
        subtitle: "终身学习者的实践指南",
        content: `
在快速变化的现代社会，持续学习新技能已成为保持竞争力的关键。无论是职业发展还是个人成长，掌握有效的学习方法都至关重要。

## 学习前的准备

### 1. 明确学习目标
- 设定具体、可衡量的学习目标
- 确定学习的时间框架
- 了解技能的应用场景

### 2. 评估现有基础
- 诚实评估自己的起点
- 识别需要补强的基础知识
- 制定循序渐进的学习计划

## 高效学习策略

### 3. 主动学习法
- 通过提问、讨论来深化理解
- 将知识应用到实际问题中
- 定期复习和总结

### 4. 项目导向学习
- 选择实际项目来应用新技能
- 在实践中发现和解决问题
- 获得成就感和学习动力

### 5. 社群学习
- 加入相关的学习社群
- 与同行交流经验和心得
- 寻找学习伙伴和导师

通过这些方法，你将能够更快、更有效地掌握新技能，在学习的道路上不断前进。
        `.trim(),
        tags: ["学习方法", "技能提升", "个人发展"]
    }
];

/**
 * 发布单篇文章示例
 */
async function publishSingleArticle() {
    console.log('🚀 开始发布单篇文章示例...');

    const publisher = new MediumPublisher();

    try {
        // 初始化发布器
        await publisher.init();
        console.log('✅ 发布器初始化成功');

        // 选择第一篇示例文章
        const article = sampleArticles[0];
        console.log(`📝 准备发布文章: ${article.title}`);

        // 发布文章（不进行AI增强，因为这是直接发布）
        console.log('ℹ️ 注意：直接发布不会进行AI增强，如需AI增强请在CSV上传时启用');
        const result = await publisher.publishArticle(article);
        console.log('🎉 文章发布成功!');
        console.log('📊 发布结果:', JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('❌ 发布失败:', error.message);
        console.error('详细错误:', error);
    } finally {
        // 清理资源
        if (publisher.page) {
            await publisher.close();
        }
    }
}

/**
 * 批量发布文章示例
 */
async function publishBatchArticles() {
    console.log('🚀 开始批量发布文章示例...');

    const publisher = new MediumPublisher();

    try {
        await publisher.init();
        console.log('✅ 发布器初始化成功');

        const results = [];

        for (let i = 0; i < sampleArticles.length; i++) {
            const article = sampleArticles[i];
            console.log(`\n📝 发布第 ${i + 1}/${sampleArticles.length} 篇文章: ${article.title}`);

            try {
                const result = await publisher.publishArticle(article);
                results.push({
                    success: true,
                    article: article.title,
                    result: result
                });
                console.log(`✅ 文章 "${article.title}" 发布成功`);

                // 文章间隔3秒，避免频繁操作
                if (i < sampleArticles.length - 1) {
                    console.log('⏱️ 等待3秒后发布下一篇...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }

            } catch (error) {
                results.push({
                    success: false,
                    article: article.title,
                    error: error.message
                });
                console.error(`❌ 文章 "${article.title}" 发布失败:`, error.message);
            }
        }

        // 显示批量发布结果
        console.log('\n📊 批量发布结果:');
        results.forEach((result, index) => {
            const status = result.success ? '✅' : '❌';
            console.log(`${status} ${index + 1}. ${result.article}`);
        });

    } catch (error) {
        console.error('❌ 批量发布失败:', error.message);
    } finally {
        if (publisher.page) {
            await publisher.close();
        }
    }
}

/**
 * 主函数
 */
async function main() {
    console.log('🎯 Medium文章发布示例脚本');
    console.log('=====================================\n');

    // 检查环境变量
    if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️ 未设置 OPENAI_API_KEY 环境变量');
        console.log('💡 这不会影响发布，但无法使用AI增强功能\n');
    }

    // 获取命令行参数
    const mode = process.argv[2] || 'single';

    switch (mode) {
        case 'single':
            await publishSingleArticle();
            break;
        case 'batch':
            await publishBatchArticles();
            break;
        case 'help':
        case '--help':
        case '-h':
            console.log('使用方法:');
            console.log('  node publish-example.js single  # 发布单篇文章 (默认)');
            console.log('  node publish-example.js batch   # 批量发布文章');
            console.log('  node publish-example.js help    # 显示帮助信息');
            break;
        default:
            console.log('❌ 未知的模式:', mode);
            console.log('💡 使用 "node publish-example.js help" 查看帮助');
    }
}

// 运行主函数
if (require.main === module) {
    main().catch(error => {
        console.error('💥 程序执行出错:', error);
        process.exit(1);
    });
}

module.exports = {
    publishSingleArticle,
    publishBatchArticles,
    sampleArticles
}; 