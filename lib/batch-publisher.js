const MediumPublisher = require('./medium-publisher');
const TableProcessor = require('./table-processor');
const OpenAIService = require('./openai-service');
const { logger } = require('./utils');
const fs = require('fs-extra');
const path = require('path');

/**
 * 批量文章发布器
 * 整合表格处理、AI增强和Medium发布功能
 */
class BatchPublisher {
    constructor(options = {}) {
        // 创建TableProcessor，启用AI增强功能
        this.tableProcessor = new TableProcessor({
            enableAIEnhancement: options.enableAIEnhancementOnUpload !== false, // 默认启用
            openaiApiKey: options.openaiApiKey || process.env.OPENAI_API_KEY,
            openaiBaseURL: options.openaiBaseURL || process.env.OPENAI_BASE_URL,
            aiOptions: options.aiOptions || {}
        });
        this.mediumPublisher = new MediumPublisher(options);

        // 初始化OpenAI服务
        try {
            this.openaiService = new OpenAIService({
                apiKey: options.openaiApiKey || process.env.OPENAI_API_KEY,
                baseURL: options.openaiBaseURL || process.env.OPENAI_BASE_URL
            });
        } catch (error) {
            logger.warn('OpenAI服务初始化失败:', error.message);
            this.openaiService = null;
        }

        this.options = {
            enhanceWithAI: false, // 默认关闭，因为在文件读取时已经进行AI增强
            maxConcurrency: 1, // 发布时一次只处理一篇文章
            delayBetweenPublish: 30000, // 发布间隔30秒
            ...options
        };

        this.statistics = {
            totalArticles: 0,
            processedArticles: 0,
            enhancedArticles: 0,
            publishedArticles: 0,
            failedArticles: 0,
            startTime: null,
            endTime: null
        };
    }

    /**
     * 从表格文件批量发布文章
     * @param {string} tableFilePath 表格文件路径
     * @param {Object} options 发布选项
     * @returns {Object} 发布结果
     */
    async publishFromTable(tableFilePath, options = {}) {
        const startTime = Date.now();
        this.statistics.startTime = new Date().toISOString();

        try {
            logger.info('=== 开始批量文章发布流程 ===');
            logger.info(`表格文件: ${tableFilePath}`);

            // 1. 读取表格文件
            logger.info('步骤 1/5: 读取表格文件');
            const articles = await this.tableProcessor.readTableFile(tableFilePath);
            this.statistics.totalArticles = articles.length;

            if (articles.length === 0) {
                throw new Error('表格中没有找到有效的文章数据');
            }

            // 2. 筛选待发布文章
            logger.info('步骤 2/5: 筛选待发布文章');
            const pendingArticles = this.tableProcessor.getPendingArticles(articles);

            if (pendingArticles.length === 0) {
                logger.info('没有待发布的文章（所有文章的"是否发送"都不是"是"）');
                return this.generateResult('NO_PENDING', articles);
            }

            logger.info(`找到 ${pendingArticles.length} 篇待发布文章`);

            // 3. 统计AI增强结果（已在文件读取时完成）
            logger.info('步骤 3/5: 检查AI增强结果');
            const enhancedArticles = pendingArticles;
            this.statistics.enhancedArticles = enhancedArticles.filter(a => a.aiEnhanced).length;
            
            if (this.statistics.enhancedArticles > 0) {
                logger.info(`✅ 已有 ${this.statistics.enhancedArticles} 篇文章在上传时完成了AI增强`);
            } else {
                logger.info('ℹ️ 没有文章进行AI增强（可能已禁用或服务不可用）');
            }

            // 4. 初始化Medium发布器
            logger.info('步骤 4/5: 初始化Medium发布器');
            await this.mediumPublisher.init();

            // 5. 批量发布文章
            logger.info('步骤 5/5: 批量发布文章');
            const publishResults = await this.publishArticlesBatch(enhancedArticles, tableFilePath, options);

            // 6. 生成最终结果
            this.statistics.endTime = new Date().toISOString();
            const result = this.generateResult('SUCCESS', articles, publishResults);

            logger.info('=== 批量发布流程完成 ===');
            logger.info(`总耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}秒`);
            logger.info(`成功发布: ${this.statistics.publishedArticles}/${this.statistics.totalArticles} 篇文章`);

            return result;

        } catch (error) {
            this.statistics.endTime = new Date().toISOString();
            logger.error('批量发布流程失败:', error);

            return {
                success: false,
                error: error.message,
                statistics: this.statistics,
                timestamp: new Date().toISOString()
            };
        } finally {
            // 清理资源
            if (this.mediumPublisher) {
                await this.mediumPublisher.close();
            }
        }
    }

    /**
     * 使用AI增强文章
     * @param {Array} articles 文章列表
     * @param {Object} options 选项
     * @returns {Array} 增强后的文章列表
     */
    async enhanceArticlesWithAI(articles, options = {}) {
        if (!this.openaiService) {
            logger.warn('OpenAI服务不可用，跳过AI增强');
            return articles;
        }

        try {
            const progressCallback = (current, total, article) => {
                logger.info(`AI增强进度: ${current}/${total} - ${article.title}`);
            };

            const enhancedArticles = await this.openaiService.enhanceArticlesBatch(articles, {
                maxConcurrency: 2,
                delayBetweenRequests: 1000,
                onProgress: progressCallback,
                ...options.aiOptions
            });

            return enhancedArticles;

        } catch (error) {
            logger.error('AI增强失败:', error);
            // 返回原文章列表，不中断流程
            return articles;
        }
    }

    /**
     * 批量发布文章
     * @param {Array} articles 文章列表
     * @param {string} tableFilePath 原始表格文件路径
     * @param {Object} options 选项
     * @returns {Array} 发布结果列表
     */
    async publishArticlesBatch(articles, tableFilePath, options = {}) {
        const publishResults = [];

        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            const articleIndex = i + 1;

            try {
                logger.info(`开始发布第 ${articleIndex}/${articles.length} 篇文章: ${article.title}`);

                // 发布文章
                const publishResult = await this.publishSingleArticle(article, options);

                if (publishResult.success) {
                    // 更新表格中的发送状态
                    await this.updateTableStatus(tableFilePath, article.index, true);
                    this.statistics.publishedArticles++;

                    logger.info(`✅ 文章发布成功: ${article.title}`);
                } else {
                    this.statistics.failedArticles++;
                    logger.error(`❌ 文章发布失败: ${article.title} - ${publishResult.error}`);
                }

                publishResults.push({
                    article: {
                        title: article.title,
                        index: article.index
                    },
                    ...publishResult,
                    timestamp: new Date().toISOString()
                });

                this.statistics.processedArticles++;

                // 发布间隔
                if (i < articles.length - 1 && this.options.delayBetweenPublish > 0) {
                    logger.info(`等待 ${this.options.delayBetweenPublish / 1000} 秒后发布下一篇文章...`);
                    await this.delay(this.options.delayBetweenPublish);
                }

            } catch (error) {
                logger.error(`发布文章时发生错误 (${article.title}):`, error);

                publishResults.push({
                    article: {
                        title: article.title,
                        index: article.index
                    },
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });

                this.statistics.failedArticles++;
                this.statistics.processedArticles++;
            }
        }

        return publishResults;
    }

    /**
     * 发布单篇文章
     * @param {Object} article 文章对象
     * @param {Object} options 选项
     * @returns {Object} 发布结果
     */
    async publishSingleArticle(article, options = {}) {
        try {
            // 准备发布数据
            const publishData = {
                title: article.title,
                content: article.content,
                tags: article.tags ? article.tags.split(',').map(tag => tag.trim()) : [],
                subtitle: '', // Medium支持副标题
                canonicalUrl: '', // 规范链接
                publishStatus: 'public', // 发布状态
                license: 'all-rights-reserved', // 许可证
                notifyFollowers: true // 通知关注者
            };

            // 调用Medium发布器
            const result = await this.mediumPublisher.publishArticle(publishData);

            return {
                success: true,
                url: result.url,
                id: result.id,
                data: result,
                aiEnhanced: article.aiEnhanced || false
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                aiEnhanced: article.aiEnhanced || false
            };
        }
    }

    /**
     * 更新表格中的发送状态
     * @param {string} tableFilePath 表格文件路径
     * @param {number} articleIndex 文章索引
     * @param {boolean} published 是否已发布
     */
    async updateTableStatus(tableFilePath, articleIndex, published) {
        try {
            await this.tableProcessor.updatePublishStatus(tableFilePath, articleIndex, published);
        } catch (error) {
            logger.error(`更新表格状态失败 (第${articleIndex}行):`, error);
            // 不抛出错误，避免影响后续发布
        }
    }

    /**
     * 生成发布结果
     * @param {string} status 状态
     * @param {Array} articles 文章列表
     * @param {Array} publishResults 发布结果
     * @returns {Object} 最终结果
     */
    generateResult(status, articles, publishResults = []) {
        const statistics = this.tableProcessor.getStatistics(articles);

        return {
            success: status === 'SUCCESS',
            status,
            statistics: {
                ...statistics,
                ...this.statistics
            },
            publishResults,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 预览表格内容
     * @param {string} tableFilePath 表格文件路径
     * @returns {Object} 预览结果
     */
    async previewTable(tableFilePath) {
        try {
            const articles = await this.tableProcessor.readTableFile(tableFilePath);
            const statistics = this.tableProcessor.getStatistics(articles);
            const pendingArticles = this.tableProcessor.getPendingArticles(articles);

            return {
                success: true,
                totalArticles: articles.length,
                pendingArticles: pendingArticles.length,
                statistics,
                articles: articles.map(article => ({
                    index: article.index,
                    title: article.title,
                    contentPreview: article.content.substring(0, 100) + '...',
                    shouldPublish: article.shouldPublish,
                    tags: article.tags,
                    hasImage: !!article.imageUrl,
                    notes: article.notes
                }))
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 测试AI服务连接
     * @returns {Object} 测试结果
     */
    async testAIConnection() {
        if (!this.openaiService) {
            return {
                success: false,
                error: 'OpenAI服务未初始化'
            };
        }

        try {
            const connected = await this.openaiService.testConnection();
            return {
                success: connected,
                message: connected ? 'AI服务连接正常' : 'AI服务连接失败'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 创建示例表格文件
     * @param {string} outputPath 输出路径
     * @param {string} format 格式 'csv' 或 'xlsx'
     * @returns {Object} 创建结果
     */
    async createSampleTable(outputPath, format = 'csv') {
        try {
            await this.tableProcessor.createSampleFile(outputPath, format);
            return {
                success: true,
                path: outputPath,
                message: `示例${format.toUpperCase()}文件创建成功`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取支持的文件格式
     * @returns {Array} 支持的格式列表
     */
    getSupportedFormats() {
        return this.tableProcessor.supportedExtensions;
    }

    /**
     * 获取当前统计信息
     * @returns {Object} 统计信息
     */
    getStatistics() {
        return { ...this.statistics };
    }

    /**
     * 重置统计信息
     */
    resetStatistics() {
        this.statistics = {
            totalArticles: 0,
            processedArticles: 0,
            enhancedArticles: 0,
            publishedArticles: 0,
            failedArticles: 0,
            startTime: null,
            endTime: null
        };
    }

    /**
     * 延迟函数
     * @param {number} ms 延迟毫秒数
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = BatchPublisher; 