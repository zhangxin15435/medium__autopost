const { logger, articleManager } = require('./lib/utils');
const MediumPublisher = require('./lib/medium-publisher');

/**
 * Medium自动发布系统主入口文件
 * 用于本地开发和测试
 */
class MediumAutoPost {
    constructor() {
        this.publisher = null;
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

            logger.info('系统初始化完成');
            return true;
        } catch (error) {
            logger.error('系统初始化失败:', error);
            return false;
        }
    }

    /**
     * 检查环境配置
     */
    checkEnvironment() {
        const required = ['MEDIUM_EMAIL', 'MEDIUM_PASSWORD'];
        const missing = required.filter(key => !process.env[key]);

        if (missing.length > 0) {
            logger.warn(`缺少环境变量: ${missing.join(', ')}`);
            logger.info('请在 .env 文件中配置这些变量');
        } else {
            logger.info('环境配置检查通过');
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
     * 显示系统状态
     */
    async showStatus() {
        try {
            const articles = await articleManager.getPendingArticles();

            console.log('\n=== 系统状态 ===');
            console.log(`待发布文章数量: ${articles.length}`);
            console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Medium账户已配置: ${!!(process.env.MEDIUM_EMAIL && process.env.MEDIUM_PASSWORD)}`);

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

        default:
            console.log(`
Medium文章自动发布系统

使用方法:
  node index.js test     - 测试Medium连接
  node index.js sample   - 创建示例文章
  node index.js publish  - 发布所有待发布文章
  node index.js status   - 显示系统状态

API端点:
  /api/cron-publish     - Cron定时任务 (每天上午9点)
  /api/publish          - 手动发布API
  /api/articles         - 文章管理API

环境变量配置请参考 .env.example 文件
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