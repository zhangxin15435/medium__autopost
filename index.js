require('dotenv').config();

const { logger, articleManager } = require('./lib/utils');
const MediumPublisher = require('./lib/medium-publisher');
const BatchPublisher = require('./lib/batch-publisher');

/**
 * Medium自动发布系统主入口文件
 * 用于本地开发和测试
 */
class MediumAutoPost {
    constructor() {
        this.publisher = null;
        this.batchPublisher = null;
    }

    /**
     * 初始化系统
     */
    async init() {
        try {
            logger.info('=== Medium自动发布系统启动 ===');

            // 检查环境变量
            this.checkEnvironment();

            // 初始化文章管理器
            await articleManager.init();

            // 初始化批量发布器
            this.batchPublisher = new BatchPublisher({
                openaiApiKey: process.env.OPENAI_API_KEY,
                openaiBaseURL: process.env.OPENAI_BASE_URL
            });

            logger.info('系统初始化完成');
            return true;
        } catch (error) {
            logger.error('系统初始化失败:', error);
            return false;
        }
    }

    /**
     * 检查环境变量配置
     */
    checkEnvironment() {
        // 只检查OpenAI相关环境变量，不再检查Medium账号密码
        const required = ['OPENAI_API_KEY'];
        const missing = required.filter(key => !process.env[key]);

        if (missing.length > 0) {
            logger.warn(`缺少环境变量: ${missing.join(', ')}`);
            logger.info('请在 .env 文件中配置这些变量');
        }
    }

    /**
     * 测试Medium连接
     */
    async testConnection() {
        try {
            logger.info('测试Medium连接...');

            this.publisher = new MediumPublisher();
            await this.publisher.init();
            await this.publisher.login();
            await this.publisher.close();

            logger.info('Medium连接测试成功！');
            return true;
        } catch (error) {
            logger.error('Medium连接测试失败:', error);
            return false;
        }
    }

    /**
     * 创建示例文章
     */
    async createSampleArticle() {
        try {
            logger.info('创建示例文章...');
            const article = await articleManager.createSampleArticle();
            logger.info(`示例文章已创建: ${article.title}`);
            return article;
        } catch (error) {
            logger.error('创建示例文章失败:', error);
            throw error;
        }
    }

    /**
     * 发布单篇文章
     */
    async publishArticle(articleData) {
        try {
            if (!this.publisher) {
                this.publisher = new MediumPublisher();
            }

            const result = await this.publisher.publishFlow(articleData);
            logger.info(`文章发布成功: ${result.title}`);
            return result;
        } catch (error) {
            logger.error('文章发布失败:', error);
            throw error;
        }
    }

    /**
     * 处理所有待发布文章
     */
    async processAllArticles() {
        try {
            logger.info('开始处理所有待发布文章...');

            const articles = await articleManager.getPendingArticles();
            if (articles.length === 0) {
                logger.info('没有待发布的文章');
                return [];
            }

            const results = [];
            for (const article of articles) {
                try {
                    const result = await this.publishArticle(article);
                    await articleManager.moveToPublished(article, result);
                    results.push({ article: article.title, status: 'success', result });
                } catch (error) {
                    logger.error(`发布文章《${article.title}》失败:`, error);
                    results.push({ article: article.title, status: 'error', error: error.message });
                }
            }

            return results;
        } catch (error) {
            logger.error('处理文章队列失败:', error);
            throw error;
        }
    }

    /**
     * 从表格文件批量发布文章
     * @param {string} tableFilePath 表格文件路径
     * @param {Object} options 发布选项
     * @returns {Object} 发布结果
     */
    async publishFromTable(tableFilePath, options = {}) {
        try {
            logger.info(`开始从表格文件批量发布: ${tableFilePath}`);
            return await this.batchPublisher.publishFromTable(tableFilePath, options);
        } catch (error) {
            logger.error('批量发布失败:', error);
            throw error;
        }
    }

    /**
     * 预览表格内容
     * @param {string} tableFilePath 表格文件路径
     * @returns {Object} 预览结果
     */
    async previewTable(tableFilePath) {
        try {
            return await this.batchPublisher.previewTable(tableFilePath);
        } catch (error) {
            logger.error('预览表格失败:', error);
            throw error;
        }
    }

    /**
     * 创建示例表格文件
     * @param {string} outputPath 输出路径
     * @param {string} format 格式
     * @returns {Object} 创建结果
     */
    async createSampleTable(outputPath, format = 'csv') {
        try {
            return await this.batchPublisher.createSampleTable(outputPath, format);
        } catch (error) {
            logger.error('创建示例表格失败:', error);
            throw error;
        }
    }

    /**
     * 测试AI服务连接
     * @returns {Object} 测试结果
     */
    async testAIConnection() {
        try {
            return await this.batchPublisher.testAIConnection();
        } catch (error) {
            logger.error('测试AI连接失败:', error);
            throw error;
        }
    }

    /**
     * 显示系统状态
     */
    async showStatus() {
        try {
            const articles = await articleManager.getPendingArticles();

            console.log('\n=== 系统状态 ===');
            console.log(`待发布文章数量: ${articles.length}`);
            console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
            console.log(`环境: ${process.env.NODE_ENV || 'development'}`);

            if (articles.length > 0) {
                console.log('\n待发布文章列表:');
                articles.forEach((article, index) => {
                    console.log(`${index + 1}. ${article.title}`);
                    if (article.scheduledTime) {
                        console.log(`   预定发布时间: ${article.scheduledTime}`);
                    }
                });
            }

            console.log('==================\n');
        } catch (error) {
            logger.error('获取系统状态失败:', error);
        }
    }

    /**
     * 交互式选择并发布单篇文章
     * @param {string} tableFilePath 表格文件路径
     * @param {number} articleNumber 文章编号（可选，避免交互式输入）
     * @returns {Object} 发布结果
     */
    async publishSingleFromTable(tableFilePath, articleNumber = null) {
        try {
            logger.info(`开始单篇文章选择和发布: ${tableFilePath}`);

            // 1. 读取表格文件
            const tableProcessor = new (require('./lib/table-processor'))();
            const articles = await tableProcessor.readTableFile(tableFilePath);

            if (articles.length === 0) {
                throw new Error('表格中没有找到有效的文章数据');
            }

            // 2. 显示文章列表供用户选择
            console.log('\n📋 可用文章列表：');
            console.log('=====================================');

            articles.forEach((article, index) => {
                const status = article.shouldPublish ? '✅ 待发布' : '⏸️  暂不发布';
                console.log(`${index + 1}. ${article.title}`);
                console.log(`   状态: ${status}`);
                console.log(`   标签: ${article.tags || '无'}`);
                console.log(`   备注: ${article.notes || '无'}`);
                console.log('-------------------------------------');
            });

            let selectedIndex = -1;

            if (articleNumber !== null) {
                // 直接使用指定的文章编号
                selectedIndex = articleNumber - 1;
                if (selectedIndex < 0 || selectedIndex >= articles.length) {
                    throw new Error(`无效的文章编号: ${articleNumber}。有效范围: 1-${articles.length}`);
                }
                console.log(`\n✅ 已指定文章编号: ${articleNumber}`);
            } else {
                // 3. 获取用户选择（交互式）
                const readline = require('readline');
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                selectedIndex = await new Promise((resolve) => {
                    rl.question('\n请输入要发布的文章编号 (1-' + articles.length + '): ', (answer) => {
                        const index = parseInt(answer) - 1;
                        if (index >= 0 && index < articles.length) {
                            resolve(index);
                        } else {
                            console.log('❌ 无效的编号，操作取消。');
                            resolve(-1);
                        }
                        rl.close();
                    });
                });
            }

            if (selectedIndex === -1) {
                return { success: false, message: '用户取消操作' };
            }

            const selectedArticle = articles[selectedIndex];
            console.log(`\n✅ 已选择文章: ${selectedArticle.title}`);

            // 4. AI增强处理（只处理选中的文章）
            console.log('\n🤖 开始AI增强处理...');
            const enhancedArticle = await this.enhanceSingleArticle(selectedArticle);

            // 5. 发布文章
            console.log('\n🚀 开始发布文章...');
            const publishResult = await this.publishSingleArticle(enhancedArticle, tableFilePath);

            return publishResult;

        } catch (error) {
            logger.error('单篇发布失败:', error);
            throw error;
        }
    }

    /**
     * 使用AI增强单篇文章
     * @param {Object} article 文章对象
     * @returns {Object} 增强后的文章
     */
    async enhanceSingleArticle(article) {
        try {
            if (!this.batchPublisher.openaiService) {
                logger.warn('OpenAI服务不可用，跳过AI增强');
                return article;
            }

            logger.info(`正在使用AI增强文章: ${article.title}`);

            // 调用AI服务增强整篇文章
            const enhancedArticle = await this.batchPublisher.openaiService.enhanceArticle(article);

            console.log('✅ AI增强完成');
            console.log(`📝 原始内容长度: ${article.content.length} 字符`);
            console.log(`📝 增强后长度: ${enhancedArticle.content.length} 字符`);
            console.log(`🏷️  生成标签: ${enhancedArticle.tags || '保持原标签'}`);

            return enhancedArticle;

        } catch (error) {
            logger.error('AI增强失败:', error);
            return article; // 返回原文章，继续发布流程
        }
    }

    /**
     * 发布单篇文章到Medium
     * @param {Object} article 文章对象
     * @param {string} tableFilePath 原表格文件路径
     * @returns {Object} 发布结果
     */
    async publishSingleArticle(article, tableFilePath) {
        try {
            // 创建Medium发布器（publishFlow会自动处理init和close）
            const publisher = new MediumPublisher();

            // 准备发布数据
            const publishData = {
                title: article.title,
                content: article.content,
                tags: article.tags ? article.tags.split(',').map(tag => tag.trim()) : [],
                subtitle: '',
                canonicalUrl: '',
                publishStatus: 'public',
                license: 'all-rights-reserved',
                notifyFollowers: true
            };

            // 执行发布（使用完整流程，包括登录）
            const result = await publisher.publishFlow(publishData);

            // 更新表格状态
            if (tableFilePath) {
                const tableProcessor = new (require('./lib/table-processor'))();
                await tableProcessor.updatePublishStatus(tableFilePath, article.index, true);
            }

            console.log('🎉 文章发布成功！');
            console.log(`📄 标题: ${article.title}`);
            console.log(`🔗 链接: ${result.url || '获取中...'}`);

            return {
                success: true,
                article: article.title,
                url: result.url,
                aiEnhanced: article.aiEnhanced || false,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.log('❌ 文章发布失败:', error.message);
            return {
                success: false,
                article: article.title,
                error: error.message,
                aiEnhanced: article.aiEnhanced || false,
                timestamp: new Date().toISOString()
            };
        }
    }
}

/**
 * 命令行参数处理
 */
async function handleCommand() {
    const args = process.argv.slice(2);
    const command = args[0];

    const app = new MediumAutoPost();
    await app.init();

    switch (command) {
        case 'test':
            await app.testConnection();
            break;

        case 'sample':
            await app.createSampleArticle();
            break;

        case 'publish':
            await app.processAllArticles();
            break;

        case 'status':
            await app.showStatus();
            break;

        case 'table':
            const tablePath = args[1];
            if (!tablePath) {
                console.log('请指定表格文件路径: node index.js table <文件路径>');
                break;
            }
            await app.publishFromTable(tablePath);
            break;

        case 'preview':
            const previewPath = args[1];
            if (!previewPath) {
                console.log('请指定表格文件路径: node index.js preview <文件路径>');
                break;
            }
            const preview = await app.previewTable(previewPath);
            console.log(JSON.stringify(preview, null, 2));
            break;

        case 'sample-table':
            const format = args[1] || 'csv';
            const outputPath = args[2] || `articles/templates/sample.${format}`;
            await app.createSampleTable(outputPath, format);
            break;

        case 'test-ai':
            const aiTest = await app.testAIConnection();
            console.log('AI服务测试结果:', aiTest);
            break;

        case 'select':
        case 'publish-single':
            const selectPath = args[1];
            if (!selectPath) {
                console.log('请指定表格文件路径: node index.js select <文件路径> [文章编号]');
                console.log('示例: node index.js select my-articles.csv 1');
                break;
            }
            const articleNumber = args[2] ? parseInt(args[2]) : null;
            await app.publishSingleFromTable(selectPath, articleNumber);
            break;

        case 'visual':
        case 'demo':
            const demoPath = args[1] || 'my-articles.csv';
            const demoNumber = args[2] ? parseInt(args[2]) : 1;
            console.log('🎬 启动可视化演示模式...');
            console.log('📝 将发布文章:', demoPath, '第', demoNumber, '篇');
            console.log('👀 请观察浏览器窗口中的自动化操作过程');
            await app.publishSingleFromTable(demoPath, demoNumber);
            break;

        default:
            console.log(`
Medium文章自动发布系统

使用方法:
  node index.js test              - 测试Medium连接
  node index.js sample            - 创建示例文章
  node index.js publish           - 发布所有待发布文章
  node index.js status            - 显示系统状态

批量发布功能:
  node index.js table <文件路径>     - 从表格文件批量发布文章
  node index.js select <文件路径> [编号] - 选择单篇文章发布（含AI增强）
  node index.js preview <文件路径>   - 预览表格文件内容
  node index.js sample-table [格式] [路径] - 创建示例表格 (格式: csv/xlsx)
  node index.js test-ai           - 测试AI服务连接

单篇发布示例:
  node index.js select my-articles.csv    - 交互式选择文章
  node index.js select my-articles.csv 1  - 直接发布第1篇文章
  node index.js visual my-articles.csv 1  - 可视化演示发布过程

API端点:
  /api/cron-publish     - Cron定时任务 (每天上午9点)
  /api/publish          - 手动发布API
  /api/articles         - 文章管理API
  /api/batch-publish    - 批量发布API
  /api/table-upload     - 表格上传API

环境变量配置:
  OPENAI_API_KEY       - OpenAI API密钥
  OPENAI_BASE_URL      - OpenAI API基础URL
  其他配置请参考 .env.example 文件
      `);
            break;
    }
}

// 如果直接运行此文件，执行命令行功能
if (require.main === module) {
    handleCommand().catch(error => {
        logger.error('命令执行失败:', error);
        process.exit(1);
    });
}

module.exports = MediumAutoPost; 