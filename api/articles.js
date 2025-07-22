const {
    logger,
    articleManager,
    ResponseUtils,
    ValidationUtils,
    TimeUtils
} = require('../lib/utils');
const fs = require('fs-extra');
const path = require('path');

/**
 * 文章管理API - 提供完整的文章CRUD操作
 * GET /api/articles - 获取文章列表
 * POST /api/articles - 创建新文章
 * PUT /api/articles - 更新文章
 * DELETE /api/articles - 删除文章
 */
module.exports = async (req, res) => {
    try {
        logger.info(`收到文章管理请求: ${req.method}`);

        // 设置CORS头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

        // 处理OPTIONS预检请求
        if (req.method === 'OPTIONS') {
            return ResponseUtils.vercelResponse(res, 200, { message: 'OK' });
        }

        // 验证API密钥（如果配置了的话）
        const apiKey = req.headers['x-api-key'] || req.body?.apiKey || req.query?.apiKey;
        if (process.env.API_SECRET_KEY && !ValidationUtils.validateApiKey(apiKey)) {
            logger.warn('API密钥验证失败');
            return ResponseUtils.vercelResponse(
                res,
                401,
                ResponseUtils.error('API密钥验证失败')
            );
        }

        // 根据请求方法处理
        switch (req.method) {
            case 'GET':
                return await handleGetArticles(req, res);

            case 'POST':
                return await handleCreateArticle(req, res);

            case 'PUT':
                return await handleUpdateArticle(req, res);

            case 'DELETE':
                return await handleDeleteArticle(req, res);

            default:
                return ResponseUtils.vercelResponse(
                    res,
                    405,
                    ResponseUtils.error('不支持的请求方法')
                );
        }

    } catch (error) {
        logger.error('文章管理API请求失败:', error);

        return ResponseUtils.vercelResponse(
            res,
            500,
            ResponseUtils.error('服务器内部错误', error)
        );
    }
};

/**
 * 获取文章列表
 */
async function handleGetArticles(req, res) {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        // 获取所有文章
        const allArticles = await articleManager.getAllArticles();

        // 按状态过滤
        let filteredArticles = allArticles;
        if (status) {
            filteredArticles = allArticles.filter(article => article.status === status);
        }

        // 分页
        const startIndex = parseInt(offset);
        const endIndex = startIndex + parseInt(limit);
        const paginatedArticles = filteredArticles.slice(startIndex, endIndex);

        // 添加统计信息
        const stats = {
            total: allArticles.length,
            pending: allArticles.filter(a => a.status === 'pending').length,
            publishing: allArticles.filter(a => a.status === 'publishing').length,
            published: allArticles.filter(a => a.status === 'published').length,
            error: allArticles.filter(a => a.status === 'error').length
        };

        logger.info(`返回 ${paginatedArticles.length} 篇文章`);

        return ResponseUtils.vercelResponse(
            res,
            200,
            ResponseUtils.success({
                articles: paginatedArticles,
                stats: stats,
                pagination: {
                    total: filteredArticles.length,
                    limit: parseInt(limit),
                    offset: startIndex,
                    hasMore: endIndex < filteredArticles.length
                }
            }, '获取文章列表成功')
        );

    } catch (error) {
        logger.error('获取文章列表失败:', error);
        return ResponseUtils.vercelResponse(
            res,
            500,
            ResponseUtils.error('获取文章列表失败', error)
        );
    }
}

/**
 * 创建新文章
 */
async function handleCreateArticle(req, res) {
    try {
        const { article } = req.body;

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
                ResponseUtils.error('文章数据验证失败', validation.errors)
            );
        }

        // 创建文章对象
        const newArticle = {
            id: `article-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: article.title,
            subtitle: article.subtitle || '',
            content: article.content,
            tags: Array.isArray(article.tags) ? article.tags : [],
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            scheduledTime: article.scheduledTime || null,
            source: 'web-interface'
        };

        // 保存文章
        await articleManager.saveArticle(newArticle);

        logger.info(`创建新文章: ${newArticle.title}`);

        return ResponseUtils.vercelResponse(
            res,
            201,
            ResponseUtils.success(newArticle, '文章创建成功')
        );

    } catch (error) {
        logger.error('创建文章失败:', error);
        return ResponseUtils.vercelResponse(
            res,
            500,
            ResponseUtils.error('创建文章失败', error)
        );
    }
}

/**
 * 更新文章
 */
async function handleUpdateArticle(req, res) {
    try {
        const { articleId, updates } = req.body;

        if (!articleId || !updates) {
            return ResponseUtils.vercelResponse(
                res,
                400,
                ResponseUtils.error('缺少文章ID或更新数据')
            );
        }

        // 获取现有文章
        const existingArticle = await articleManager.getArticleById(articleId);
        if (!existingArticle) {
            return ResponseUtils.vercelResponse(
                res,
                404,
                ResponseUtils.error('文章不存在')
            );
        }

        // 合并更新
        const updatedArticle = {
            ...existingArticle,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        // 验证更新后的文章
        const validation = ValidationUtils.validateArticle(updatedArticle);
        if (!validation.isValid) {
            return ResponseUtils.vercelResponse(
                res,
                400,
                ResponseUtils.error('文章数据验证失败', validation.errors)
            );
        }

        // 保存更新
        await articleManager.saveArticle(updatedArticle);

        logger.info(`更新文章: ${updatedArticle.title}`);

        return ResponseUtils.vercelResponse(
            res,
            200,
            ResponseUtils.success(updatedArticle, '文章更新成功')
        );

    } catch (error) {
        logger.error('更新文章失败:', error);
        return ResponseUtils.vercelResponse(
            res,
            500,
            ResponseUtils.error('更新文章失败', error)
        );
    }
}

/**
 * 删除文章
 */
async function handleDeleteArticle(req, res) {
    try {
        const { articleId } = req.body;

        if (!articleId) {
            return ResponseUtils.vercelResponse(
                res,
                400,
                ResponseUtils.error('缺少文章ID')
            );
        }

        // 检查文章是否存在
        const article = await articleManager.getArticleById(articleId);
        if (!article) {
            return ResponseUtils.vercelResponse(
                res,
                404,
                ResponseUtils.error('文章不存在')
            );
        }

        // 删除文章
        await articleManager.deleteArticle(articleId);

        logger.info(`删除文章: ${article.title}`);

        return ResponseUtils.vercelResponse(
            res,
            200,
            ResponseUtils.success({ articleId }, '文章删除成功')
        );

    } catch (error) {
        logger.error('删除文章失败:', error);
        return ResponseUtils.vercelResponse(
            res,
            500,
            ResponseUtils.error('删除文章失败', error)
        );
    }
} 