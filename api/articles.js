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
 * 支持查询参数: status, limit, offset
 */
async function handleGetArticles(req, res) {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        // 获取待发布文章
        const pendingArticles = await articleManager.getPendingArticles();

        // 获取已发布文章
        const publishedDir = path.join(process.cwd(), 'articles', 'published');
        let publishedArticles = [];

        try {
            const publishedFiles = await fs.readdir(publishedDir);
            for (const file of publishedFiles) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(publishedDir, file);
                    const articleData = await fs.readJson(filePath);
                    publishedArticles.push({
                        ...articleData,
                        fileName: file,
                        filePath: filePath,
                        status: 'published'
                    });
                }
            }
        } catch (error) {
            // 如果目录不存在或读取失败，忽略错误
            logger.debug('读取已发布文章目录失败:', error.message);
        }

        // 合并所有文章
        let allArticles = [
            ...pendingArticles.map(article => ({ ...article, status: article.status || 'pending' })),
            ...publishedArticles
        ];

        // 按状态过滤
        if (status) {
            allArticles = allArticles.filter(article => article.status === status);
        }

        // 按创建时间排序
        allArticles.sort((a, b) => {
            const dateA = new Date(a.createdAt || a.scheduledTime || '1970-01-01');
            const dateB = new Date(b.createdAt || b.scheduledTime || '1970-01-01');
            return dateB.getTime() - dateA.getTime();
        });

        // 分页
        const startIndex = parseInt(offset);
        const endIndex = startIndex + parseInt(limit);
        const paginatedArticles = allArticles.slice(startIndex, endIndex);

        // 格式化返回数据
        const formattedArticles = paginatedArticles.map(article => ({
            fileName: article.fileName,
            title: article.title,
            subtitle: article.subtitle,
            status: article.status,
            scheduledTime: article.scheduledTime,
            createdAt: article.createdAt,
            publishedAt: article.publishedAt,
            tags: article.tags,
            contentPreview: article.content ? article.content.substring(0, 200) + '...' : '',
            url: article.publishResult?.url || null,
            scheduledTimeFormatted: article.scheduledTime ? TimeUtils.formatPublishTime(article.scheduledTime) : null
        }));

        const result = {
            articles: formattedArticles,
            pagination: {
                total: allArticles.length,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: endIndex < allArticles.length
            },
            summary: {
                pending: allArticles.filter(a => a.status === 'pending' || a.status === 'scheduled').length,
                published: allArticles.filter(a => a.status === 'published').length
            }
        };

        return ResponseUtils.vercelResponse(
            res,
            200,
            ResponseUtils.success(result, '获取文章列表成功')
        );

    } catch (error) {
        logger.error('获取文章列表失败:', error);
        throw error;
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
                ResponseUtils.error('文章数据验证失败', { errors: validation.errors })
            );
        }

        // 验证发布时间（如果有）
        if (article.scheduledTime) {
            const scheduledTime = new Date(article.scheduledTime);
            if (isNaN(scheduledTime.getTime())) {
                return ResponseUtils.vercelResponse(
                    res,
                    400,
                    ResponseUtils.error('发布时间格式无效')
                );
            }
        }

        // 生成文件名
        const timestamp = Date.now();
        const fileName = `article-${timestamp}.json`;
        const filePath = path.join(process.cwd(), 'articles', 'drafts', fileName);

        // 准备文章数据
        const articleData = {
            ...article,
            status: article.scheduledTime ? 'scheduled' : 'pending',
            createdAt: new Date().toISOString(),
            source: 'api'
        };

        // 保存文章
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, articleData, { spaces: 2 });

        logger.info(`新文章已创建: ${fileName}`);

        return ResponseUtils.vercelResponse(
            res,
            201,
            ResponseUtils.success(
                { fileName, article: articleData },
                '文章创建成功'
            )
        );

    } catch (error) {
        logger.error('创建文章失败:', error);
        throw error;
    }
}

/**
 * 更新文章
 */
async function handleUpdateArticle(req, res) {
    try {
        const { fileName, article } = req.body;

        if (!fileName || !article) {
            return ResponseUtils.vercelResponse(
                res,
                400,
                ResponseUtils.error('缺少文件名或文章数据')
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

        // 查找文章文件
        const draftsDir = path.join(process.cwd(), 'articles', 'drafts');
        const filePath = path.join(draftsDir, fileName);

        // 检查文件是否存在
        if (!await fs.pathExists(filePath)) {
            return ResponseUtils.vercelResponse(
                res,
                404,
                ResponseUtils.error('文章不存在')
            );
        }

        // 读取原文章数据
        const originalArticle = await fs.readJson(filePath);

        // 合并更新数据
        const updatedArticle = {
            ...originalArticle,
            ...article,
            updatedAt: new Date().toISOString()
        };

        // 保存更新
        await fs.writeJson(filePath, updatedArticle, { spaces: 2 });

        logger.info(`文章已更新: ${fileName}`);

        return ResponseUtils.vercelResponse(
            res,
            200,
            ResponseUtils.success(
                { fileName, article: updatedArticle },
                '文章更新成功'
            )
        );

    } catch (error) {
        logger.error('更新文章失败:', error);
        throw error;
    }
}

/**
 * 删除文章
 */
async function handleDeleteArticle(req, res) {
    try {
        const { fileName } = req.body;

        if (!fileName) {
            return ResponseUtils.vercelResponse(
                res,
                400,
                ResponseUtils.error('缺少文件名')
            );
        }

        // 查找文章文件（先在草稿目录找，再在已发布目录找）
        const draftsDir = path.join(process.cwd(), 'articles', 'drafts');
        const publishedDir = path.join(process.cwd(), 'articles', 'published');

        let filePath = path.join(draftsDir, fileName);
        let found = await fs.pathExists(filePath);

        if (!found) {
            filePath = path.join(publishedDir, fileName);
            found = await fs.pathExists(filePath);
        }

        if (!found) {
            return ResponseUtils.vercelResponse(
                res,
                404,
                ResponseUtils.error('文章不存在')
            );
        }

        // 删除文件
        await fs.remove(filePath);

        logger.info(`文章已删除: ${fileName}`);

        return ResponseUtils.vercelResponse(
            res,
            200,
            ResponseUtils.success(null, '文章删除成功')
        );

    } catch (error) {
        logger.error('删除文章失败:', error);
        throw error;
    }
} 