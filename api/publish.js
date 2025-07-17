const MediumPublisher = require('../lib/medium-publisher');
const {
    logger,
    articleManager,
    ResponseUtils,
    ValidationUtils
} = require('../lib/utils');

/**
 * 手动发布API - 支持立即发布或添加到队列
 * POST /api/publish
 */
module.exports = async (req, res) => {
    try {
        logger.info('收到手动发布请求');

        // 验证请求方法
        if (req.method !== 'POST') {
            return ResponseUtils.vercelResponse(
                res,
                405,
                ResponseUtils.error('仅支持POST请求')
            );
        }

        // 验证API密钥（如果配置了的话）
        const apiKey = req.headers['x-api-key'] || req.body?.apiKey;
        if (process.env.API_SECRET_KEY && !ValidationUtils.validateApiKey(apiKey)) {
            logger.warn('API密钥验证失败');
            return ResponseUtils.vercelResponse(
                res,
                401,
                ResponseUtils.error('API密钥验证失败')
            );
        }

        // 解析请求数据
        const { action, article, immediate = false } = req.body;

        if (!action) {
            return ResponseUtils.vercelResponse(
                res,
                400,
                ResponseUtils.error('缺少action参数')
            );
        }

        // 处理不同的操作
        switch (action) {
            case 'publish':
                return await handlePublish(req, res, article, immediate);

            case 'schedule':
                return await handleSchedule(req, res, article);

            case 'list':
                return await handleList(req, res);

            case 'test':
                return await handleTest(req, res);

            default:
                return ResponseUtils.vercelResponse(
                    res,
                    400,
                    ResponseUtils.error('不支持的操作类型')
                );
        }

    } catch (error) {
        logger.error('API请求处理失败:', error);

        return ResponseUtils.vercelResponse(
            res,
            500,
            ResponseUtils.error('服务器内部错误', error)
        );
    }
};

/**
 * 处理立即发布
 */
async function handlePublish(req, res, article, immediate) {
    try {
        if (!article) {
            return ResponseUtils.vercelResponse(
                res,
                400,
                ResponseUtils.error('缺少文章数据')
            );
        }

        // 验证文章数据
        const validation = ValidationUtils.validateArticle(article);
        if (!validation.isValid) {
            return ResponseUtils.vercelResponse(
                res,
                400,
                ResponseUtils.error('文章数据验证失败', { errors: validation.errors })
            );
        }

        // 检查Medium账户配置
        if (!process.env.MEDIUM_EMAIL || !process.env.MEDIUM_PASSWORD) {
            return ResponseUtils.vercelResponse(
                res,
                500,
                ResponseUtils.error('Medium账户信息未配置')
            );
        }

        if (immediate) {
            // 立即发布
            logger.info(`开始立即发布文章: ${article.title}`);

            const publisher = new MediumPublisher();
            const publishResult = await publisher.publishFlow(article);

            logger.info(`文章《${article.title}》发布成功`);

            return ResponseUtils.vercelResponse(
                res,
                200,
                ResponseUtils.success(publishResult, '文章发布成功')
            );
        } else {
            // 添加到发布队列
            const fs = require('fs-extra');
            const path = require('path');

            const fileName = `manual-${Date.now()}.json`;
            const filePath = path.join(process.cwd(), 'articles', 'drafts', fileName);

            const articleData = {
                ...article,
                status: 'pending',
                createdAt: new Date().toISOString(),
                source: 'manual'
            };

            await fs.ensureDir(path.dirname(filePath));
            await fs.writeJson(filePath, articleData, { spaces: 2 });

            logger.info(`文章已添加到发布队列: ${fileName}`);

            return ResponseUtils.vercelResponse(
                res,
                200,
                ResponseUtils.success(
                    { fileName, article: articleData },
                    '文章已添加到发布队列'
                )
            );
        }

    } catch (error) {
        logger.error('发布文章失败:', error);
        throw error;
    }
}

/**
 * 处理定时发布
 */
async function handleSchedule(req, res, article) {
    try {
        if (!article || !article.scheduledTime) {
            return ResponseUtils.vercelResponse(
                res,
                400,
                ResponseUtils.error('缺少文章数据或发布时间')
            );
        }

        // 验证发布时间
        const scheduledTime = new Date(article.scheduledTime);
        if (isNaN(scheduledTime.getTime()) || scheduledTime <= new Date()) {
            return ResponseUtils.vercelResponse(
                res,
                400,
                ResponseUtils.error('发布时间无效或不能是过去时间')
            );
        }

        // 验证文章数据
        const validation = ValidationUtils.validateArticle(article);
        if (!validation.isValid) {
            return ResponseUtils.vercelResponse(
                res,
                400,
                ResponseUtils.error('文章数据验证失败', { errors: validation.errors })
            );
        }

        // 保存为定时文章
        const fs = require('fs-extra');
        const path = require('path');

        const fileName = `scheduled-${Date.now()}.json`;
        const filePath = path.join(process.cwd(), 'articles', 'drafts', fileName);

        const articleData = {
            ...article,
            status: 'scheduled',
            createdAt: new Date().toISOString(),
            source: 'scheduled'
        };

        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, articleData, { spaces: 2 });

        logger.info(`定时文章已创建: ${fileName}`);

        return ResponseUtils.vercelResponse(
            res,
            200,
            ResponseUtils.success(
                { fileName, article: articleData },
                '定时发布任务已创建'
            )
        );

    } catch (error) {
        logger.error('创建定时任务失败:', error);
        throw error;
    }
}

/**
 * 处理文章列表查询
 */
async function handleList(req, res) {
    try {
        const pendingArticles = await articleManager.getPendingArticles();

        const articlesInfo = pendingArticles.map(article => ({
            fileName: article.fileName,
            title: article.title,
            status: article.status,
            scheduledTime: article.scheduledTime,
            createdAt: article.createdAt,
            tags: article.tags
        }));

        return ResponseUtils.vercelResponse(
            res,
            200,
            ResponseUtils.success(
                { articles: articlesInfo, count: articlesInfo.length },
                '获取文章列表成功'
            )
        );

    } catch (error) {
        logger.error('获取文章列表失败:', error);
        throw error;
    }
}

/**
 * 处理系统测试
 */
async function handleTest(req, res) {
    try {
        // 创建示例文章
        const sampleArticle = await articleManager.createSampleArticle();

        const testResult = {
            environment: process.env.NODE_ENV || 'development',
            mediumConfigured: !!(process.env.MEDIUM_EMAIL && process.env.MEDIUM_PASSWORD),
            articleCreated: true,
            sampleArticle: {
                title: sampleArticle.title,
                scheduledTime: sampleArticle.scheduledTime
            },
            timestamp: new Date().toISOString()
        };

        return ResponseUtils.vercelResponse(
            res,
            200,
            ResponseUtils.success(testResult, '系统测试完成')
        );

    } catch (error) {
        logger.error('系统测试失败:', error);
        throw error;
    }
} 