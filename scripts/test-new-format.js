const path = require('path');
const fs = require('fs-extra');
const TableProcessor = require('../lib/table-processor');
const { logger } = require('../lib/utils');

/**
 * 测试新的CSV列名格式
 */
async function testNewFormat() {
    try {
        logger.info('=== 测试新CSV列名格式 ===');

        // 创建TableProcessor实例
        const processor = new TableProcessor();

        // 测试文件路径
        const testDir = path.join(process.cwd(), 'test-files');
        await fs.ensureDir(testDir);

        // 1. 创建新格式的示例文件
        logger.info('\n1. 创建新格式示例文件...');
        const newFormatFile = path.join(testDir, 'new-format-sample.csv');
        await processor.createNewSampleFile(newFormatFile);
        logger.info(`✅ 已创建: ${newFormatFile}`);

        // 2. 读取并解析新格式文件
        logger.info('\n2. 读取新格式文件...');
        const articles = await processor.readTableFile(newFormatFile);
        logger.info(`✅ 成功读取 ${articles.length} 篇文章`);

        // 3. 显示解析结果
        logger.info('\n3. 解析结果:');
        articles.forEach((article, index) => {
            logger.info(`\n文章 ${index + 1}:`);
            logger.info(`  - 标题: ${article.title}`);
            logger.info(`  - 作者: ${article.author}`);
            logger.info(`  - 格式: ${article.format}`);
            logger.info(`  - 渠道: ${article.channel}`);
            logger.info(`  - 待发布: ${article.shouldPublish ? '是' : '否'}`);
            logger.info(`  - 已完成: ${article.publishComplete ? '是' : '否'}`);
            logger.info(`  - 标签: ${article.tags}`);
            logger.info(`  - 内容长度: ${article.content.length} 字符`);
        });

        // 4. 测试列名映射
        logger.info('\n4. 测试列名映射...');
        const testRow = {
            '主题': '测试标题',
            '发布': '是',
            '提出人': '测试作者',
            '发布内容': '测试内容',
            '格式转换': 'html',
            'markdown格标签': '测试,标签',
            '图片': 'https://test.com/image.jpg',
            '渠道&账号': 'Medium/@test',
            '发布完成': '否'
        };

        logger.info('\n原始数据:');
        Object.entries(testRow).forEach(([key, value]) => {
            logger.info(`  ${key}: ${value}`);
        });

        logger.info('\n映射后的值:');
        logger.info(`  title: ${processor.getColumnValue(testRow, 'title')}`);
        logger.info(`  content: ${processor.getColumnValue(testRow, 'content')}`);
        logger.info(`  shouldPublish: ${processor.getColumnValue(testRow, 'shouldPublish')}`);
        logger.info(`  author: ${processor.getColumnValue(testRow, 'author')}`);
        logger.info(`  format: ${processor.getColumnValue(testRow, 'format')}`);
        logger.info(`  tags: ${processor.getColumnValue(testRow, 'tags')}`);
        logger.info(`  imageUrl: ${processor.getColumnValue(testRow, 'imageUrl')}`);
        logger.info(`  channel: ${processor.getColumnValue(testRow, 'channel')}`);
        logger.info(`  publishComplete: ${processor.getColumnValue(testRow, 'publishComplete')}`);

        // 5. 测试向后兼容性
        logger.info('\n5. 测试向后兼容性...');
        const oldFormatFile = path.join(testDir, 'old-format-sample.csv');
        await processor.createSampleFile(oldFormatFile);

        const oldArticles = await processor.readTableFile(oldFormatFile);
        logger.info(`✅ 旧格式文件读取成功: ${oldArticles.length} 篇文章`);

        // 6. 测试状态更新
        logger.info('\n6. 测试状态更新...');
        await processor.updateCSVStatus(newFormatFile, 1, true);
        logger.info('✅ 新格式文件状态更新成功');

        await processor.updateCSVStatus(oldFormatFile, 1, true);
        logger.info('✅ 旧格式文件状态更新成功');

        logger.info('\n=== 测试完成 ===');
        logger.info(`测试文件保存在: ${testDir}`);

    } catch (error) {
        logger.error('测试失败:', error);
        process.exit(1);
    }
}

// 运行测试
if (require.main === module) {
    testNewFormat();
} 