const MediumPublisher = require('./medium-publisher');
const MediumReversePublisher = require('./medium-api-reverse');
const { logger } = require('./utils');

/**
 * Medium智能混合发布器
 * 根据环境和需求自动选择最优的发布方式
 */
class HybridPublisher {
    constructor(options = {}) {
        this.options = options;
        this.puppeteerPublisher = null;
        this.reversePublisher = null;
        this.publisherType = null;

        // 发布策略配置
        this.strategy = options.strategy || 'auto'; // auto, reverse, puppeteer, fallback
        this.preferReverse = options.preferReverse !== false; // 默认优先使用逆向方式
        this.enableFallback = options.enableFallback !== false; // 默认启用备用方案

        logger.info('智能混合发布器已初始化');
    }

    /**
     * 自动选择最佳发布方式
     */
    async selectOptimalPublisher() {
        try {
            logger.info('正在选择最佳发布方式...');

            switch (this.strategy) {
                case 'reverse':
                    return await this.initReversePublisher();

                case 'puppeteer':
                    return await this.initPuppeteerPublisher();

                case 'auto':
                default:
                    return await this.autoSelectPublisher();
            }
        } catch (error) {
            logger.error('发布器选择失败:', error.message);
            throw error;
        }
    }

    /**
     * 自动选择发布器的智能逻辑
     */
    async autoSelectPublisher() {
        const capabilities = await this.assessCapabilities();

        logger.info('环境评估结果:', capabilities);

        // 优先级决策逻辑
        if (this.preferReverse && capabilities.hasApiAccess) {
            try {
                logger.info('🚀 优先尝试逆向分析方式...');
                await this.initReversePublisher();
                this.publisherType = 'reverse';
                logger.info('✅ 逆向分析发布器初始化成功');
                return this.reversePublisher;
            } catch (error) {
                logger.warn('❌ 逆向分析方式失败:', error.message);

                if (this.enableFallback && capabilities.hasPuppeteerSupport) {
                    logger.info('🔄 切换到Puppeteer备用方案...');
                    return await this.initPuppeteerPublisher();
                } else {
                    throw error;
                }
            }
        } else if (capabilities.hasPuppeteerSupport) {
            logger.info('🤖 使用Puppeteer方式...');
            await this.initPuppeteerPublisher();
            this.publisherType = 'puppeteer';
            return this.puppeteerPublisher;
        } else {
            throw new Error('没有可用的发布方式');
        }
    }

    /**
     * 评估当前环境的发布能力
     */
    async assessCapabilities() {
        const capabilities = {
            hasApiAccess: false,
            hasPuppeteerSupport: false,
            hasIntegrationToken: false,
            hasCookies: false,
            isHeadlessSupported: false,
            performance: 'unknown'
        };

        try {
            // 检查Integration Token
            if (process.env.MEDIUM_INTEGRATION_TOKEN) {
                capabilities.hasIntegrationToken = true;
                capabilities.hasApiAccess = true;
                logger.info('✅ 检测到Integration Token');
            }

            // 检查Cookie文件
            const fs = require('fs-extra');
            const path = require('path');
            const cookieFile = path.join(process.cwd(), 'cookies.json');

            if (await fs.pathExists(cookieFile)) {
                capabilities.hasCookies = true;
                capabilities.hasApiAccess = true;
                logger.info('✅ 检测到Cookie文件');
            }

            // 检查Puppeteer支持
            try {
                const puppeteer = require('puppeteer');
                capabilities.hasPuppeteerSupport = true;

                // 检查无头模式支持
                if (process.env.DISPLAY || process.platform === 'win32') {
                    capabilities.isHeadlessSupported = true;
                }
                logger.info('✅ Puppeteer环境可用');
            } catch (error) {
                logger.warn('❌ Puppeteer不可用:', error.message);
            }

            // 评估性能优先级
            if (capabilities.hasApiAccess) {
                capabilities.performance = 'high';
            } else if (capabilities.hasPuppeteerSupport) {
                capabilities.performance = 'medium';
            } else {
                capabilities.performance = 'none';
            }

        } catch (error) {
            logger.warn('环境评估出错:', error.message);
        }

        return capabilities;
    }

    /**
     * 初始化逆向分析发布器
     */
    async initReversePublisher() {
        try {
            this.reversePublisher = new MediumReversePublisher(this.options);
            await this.reversePublisher.init();
            this.publisherType = 'reverse';
            logger.info('逆向分析发布器初始化成功');
            return this.reversePublisher;
        } catch (error) {
            logger.error('逆向分析发布器初始化失败:', error.message);
            throw error;
        }
    }

    /**
     * 初始化Puppeteer发布器
     */
    async initPuppeteerPublisher() {
        try {
            this.puppeteerPublisher = new MediumPublisher(this.options);
            await this.puppeteerPublisher.init();
            this.publisherType = 'puppeteer';
            logger.info('Puppeteer发布器初始化成功');
            return this.puppeteerPublisher;
        } catch (error) {
            logger.error('Puppeteer发布器初始化失败:', error.message);
            throw error;
        }
    }

    /**
     * 智能发布文章
     * @param {Object} article 文章对象
     * @param {Object} options 发布选项
     */
    async publishArticle(article, options = {}) {
        const startTime = Date.now();

        try {
            logger.info(`开始智能发布文章: ${article.title}`);
            logger.info(`当前发布器类型: ${this.publisherType}`);

            let result;
            let attempts = 0;
            const maxAttempts = this.enableFallback ? 2 : 1;

            while (attempts < maxAttempts) {
                attempts++;

                try {
                    // 根据当前发布器类型执行发布
                    if (this.publisherType === 'reverse' && this.reversePublisher) {
                        result = await this.reversePublisher.publishArticle(article);
                    } else if (this.publisherType === 'puppeteer' && this.puppeteerPublisher) {
                        result = await this.puppeteerPublisher.publishArticle(article);
                    } else {
                        throw new Error('没有可用的发布器');
                    }

                    // 发布成功，跳出重试循环
                    break;

                } catch (error) {
                    logger.warn(`第${attempts}次发布尝试失败:`, error.message);

                    // 如果是第一次失败且启用了备用方案
                    if (attempts === 1 && this.enableFallback) {
                        logger.info('🔄 尝试切换到备用发布方式...');

                        try {
                            if (this.publisherType === 'reverse') {
                                // 从逆向方式切换到Puppeteer
                                await this.initPuppeteerPublisher();
                                logger.info('已切换到Puppeteer备用方案');
                            } else {
                                // 从Puppeteer切换到逆向方式
                                await this.initReversePublisher();
                                logger.info('已切换到逆向分析备用方案');
                            }
                        } catch (switchError) {
                            logger.error('备用方案切换失败:', switchError.message);
                            throw error; // 抛出原始错误
                        }
                    } else {
                        // 最后一次尝试失败
                        throw error;
                    }
                }
            }

            const duration = Date.now() - startTime;

            // 增强结果信息
            const enhancedResult = {
                ...result,
                publisherType: this.publisherType,
                duration: duration,
                attempts: attempts
            };

            logger.info(`✅ 文章《${article.title}》发布成功！`);
            logger.info(`发布方式: ${this.publisherType}, 耗时: ${duration}ms, 尝试次数: ${attempts}`);

            return enhancedResult;

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`❌ 文章《${article.title}》发布失败:`, error.message);
            logger.error(`发布方式: ${this.publisherType}, 耗时: ${duration}ms`);

            throw new Error(`智能发布失败: ${error.message}`);
        }
    }

    /**
     * 批量智能发布
     * @param {Array} articles 文章数组
     * @param {Object} options 批量发布选项
     */
    async batchPublish(articles, options = {}) {
        const results = [];
        const delay = options.delay || 5000;
        const enableOptimization = options.enableOptimization !== false;

        logger.info(`开始批量发布 ${articles.length} 篇文章`);

        // 智能优化：预评估最佳发布方式
        if (enableOptimization && articles.length > 1) {
            await this.optimizeForBatch(articles);
        }

        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            const articleStartTime = Date.now();

            try {
                logger.info(`发布第 ${i + 1}/${articles.length} 篇文章: ${article.title}`);

                const result = await this.publishArticle(article, options);
                const duration = Date.now() - articleStartTime;

                results.push({
                    ...result,
                    article: article.title,
                    index: i + 1,
                    duration: duration
                });

                // 添加延迟（除了最后一篇）
                if (i < articles.length - 1) {
                    logger.info(`等待 ${delay / 1000} 秒后发布下一篇...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

            } catch (error) {
                const duration = Date.now() - articleStartTime;

                logger.error(`发布文章《${article.title}》失败:`, error.message);

                results.push({
                    success: false,
                    error: error.message,
                    article: article.title,
                    index: i + 1,
                    duration: duration,
                    publisherType: this.publisherType
                });

                // 根据错误类型决定是否继续
                if (this.shouldStopBatch(error)) {
                    logger.warn('检测到严重错误，停止批量发布');
                    break;
                }
            }
        }

        // 批量发布统计
        const summary = this.generateBatchSummary(results);
        logger.info('批量发布完成:', summary);

        return {
            results: results,
            summary: summary
        };
    }

    /**
     * 为批量发布优化发布器选择
     */
    async optimizeForBatch(articles) {
        try {
            logger.info('正在为批量发布优化发布器选择...');

            // 评估文章特性
            const hasComplexContent = articles.some(article =>
                article.content.length > 5000 ||
                (article.tags && article.tags.length > 10)
            );

            const totalArticles = articles.length;

            // 优化策略
            if (totalArticles > 5 && this.reversePublisher) {
                logger.info('批量发布数量较多，优先使用逆向分析方式以提高效率');
                this.publisherType = 'reverse';
            } else if (hasComplexContent && this.puppeteerPublisher) {
                logger.info('检测到复杂内容，使用Puppeteer方式确保兼容性');
                this.publisherType = 'puppeteer';
            }

        } catch (error) {
            logger.warn('批量发布优化失败:', error.message);
        }
    }

    /**
     * 判断是否应该停止批量发布
     */
    shouldStopBatch(error) {
        const criticalErrors = [
            'Integration Token无效',
            'Cookie已过期',
            '网络连接失败',
            '账户被限制'
        ];

        return criticalErrors.some(criticalError =>
            error.message.includes(criticalError)
        );
    }

    /**
     * 生成批量发布统计摘要
     */
    generateBatchSummary(results) {
        const total = results.length;
        const successful = results.filter(r => r.success).length;
        const failed = total - successful;
        const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
        const avgDuration = totalDuration / total;

        return {
            total: total,
            successful: successful,
            failed: failed,
            successRate: ((successful / total) * 100).toFixed(1) + '%',
            totalDuration: totalDuration,
            avgDuration: Math.round(avgDuration),
            publisherType: this.publisherType
        };
    }

    /**
     * 获取当前发布器状态
     */
    getStatus() {
        return {
            publisherType: this.publisherType,
            isReverseReady: !!this.reversePublisher,
            isPuppeteerReady: !!this.puppeteerPublisher,
            strategy: this.strategy,
            preferReverse: this.preferReverse,
            enableFallback: this.enableFallback
        };
    }

    /**
     * 完整的智能发布流程
     */
    async publishFlow(article) {
        try {
            // 选择最佳发布器
            await this.selectOptimalPublisher();

            // 执行发布
            const result = await this.publishArticle(article);

            // 清理资源
            await this.close();

            return result;
        } catch (error) {
            await this.close();
            throw error;
        }
    }

    /**
     * 清理资源
     */
    async close() {
        try {
            if (this.puppeteerPublisher) {
                await this.puppeteerPublisher.close();
            }
            // 逆向分析发布器通常不需要特殊清理
            logger.info('发布器资源已清理');
        } catch (error) {
            logger.warn('清理资源时出错:', error.message);
        }
    }
}

module.exports = HybridPublisher; 