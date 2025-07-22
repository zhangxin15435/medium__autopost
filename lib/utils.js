const fs = require('fs-extra');
const path = require('path');
const { format } = require('date-fns');

/**
 * 日志记录工具
 */
class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.debugMode = process.env.DEBUG_MODE === 'true';
    }

    /**
     * 格式化日志消息
     */
    formatMessage(level, message, data = null) {
        const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
        const logData = data ? ` | 数据: ${JSON.stringify(data)}` : '';
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${logData}`;
    }

    /**
     * 信息日志
     */
    info(message, data = null) {
        const logMessage = this.formatMessage('info', message, data);
        console.log(logMessage);
        this.writeToFile('info', logMessage);
    }

    /**
     * 错误日志
     */
    error(message, error = null) {
        const errorData = error ? {
            message: error.message,
            stack: error.stack
        } : null;
        const logMessage = this.formatMessage('error', message, errorData);
        console.error(logMessage);
        this.writeToFile('error', logMessage);
    }

    /**
     * 警告日志
     */
    warn(message, data = null) {
        const logMessage = this.formatMessage('warn', message, data);
        console.warn(logMessage);
        this.writeToFile('warn', logMessage);
    }

    /**
     * 调试日志
     */
    debug(message, data = null) {
        if (this.debugMode) {
            const logMessage = this.formatMessage('debug', message, data);
            console.log(logMessage);
            this.writeToFile('debug', logMessage);
        }
    }

    /**
     * 写入日志文件
     */
    async writeToFile(level, message) {
        try {
            if (!this.debugMode && level === 'debug') return;

            const today = format(new Date(), 'yyyy-MM-dd');
            const logDir = path.join(process.cwd(), 'logs');
            const logFile = path.join(logDir, `${today}.log`);

            await fs.ensureDir(logDir);
            await fs.appendFile(logFile, message + '\n');
        } catch (error) {
            // 避免日志记录错误导致的循环
            console.error('写入日志文件失败:', error.message);
        }
    }
}

/**
 * 文章管理工具
 */
class ArticleManager {
    constructor() {
        this.articlesDir = path.join(process.cwd(), 'articles');
        this.draftsDir = path.join(this.articlesDir, 'drafts');
        this.publishedDir = path.join(this.articlesDir, 'published');
        this.init();
    }

    /**
     * 初始化目录结构
     */
    async init() {
        try {
            await fs.ensureDir(this.draftsDir);
            await fs.ensureDir(this.publishedDir);
        } catch (error) {
            logger.error('初始化文章目录失败:', error);
        }
    }

    /**
     * 获取待发布的文章列表
     */
    async getPendingArticles() {
        try {
            const files = await fs.readdir(this.draftsDir);
            const articles = [];

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.draftsDir, file);
                    const articleData = await fs.readJson(filePath);
                    articles.push({
                        ...articleData,
                        fileName: file,
                        filePath: filePath
                    });
                }
            }

            // 按照预定发布时间排序
            return articles.sort((a, b) => {
                const dateA = new Date(a.scheduledTime || '9999-12-31');
                const dateB = new Date(b.scheduledTime || '9999-12-31');
                return dateA.getTime() - dateB.getTime();
            });

        } catch (error) {
            logger.error('获取待发布文章失败:', error);
            return [];
        }
    }

    /**
     * 移动文章到已发布目录
     */
    async moveToPublished(article, publishResult) {
        try {
            const publishedData = {
                ...article,
                publishResult: publishResult,
                publishedAt: new Date().toISOString()
            };

            const publishedFile = path.join(
                this.publishedDir,
                `${format(new Date(), 'yyyy-MM-dd')}-${article.fileName}`
            );

            await fs.writeJson(publishedFile, publishedData, { spaces: 2 });
            await fs.remove(article.filePath);

            logger.info(`文章已移动到已发布目录: ${publishedFile}`);
        } catch (error) {
            logger.error('移动文章到已发布目录失败:', error);
        }
    }

    /**
     * 获取所有文章（包括草稿和已发布）
     */
    async getAllArticles() {
        try {
            const allArticles = [];

            // 获取草稿文章
            try {
                const draftFiles = await fs.readdir(this.draftsDir);
                for (const file of draftFiles) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.draftsDir, file);
                        const articleData = await fs.readJson(filePath);
                        allArticles.push({
                            ...articleData,
                            id: articleData.id || file.replace('.json', ''),
                            fileName: file,
                            filePath: filePath,
                            status: articleData.status || 'pending'
                        });
                    }
                }
            } catch (error) {
                logger.debug('读取草稿目录失败:', error.message);
            }

            // 获取已发布文章
            try {
                const publishedFiles = await fs.readdir(this.publishedDir);
                for (const file of publishedFiles) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.publishedDir, file);
                        const articleData = await fs.readJson(filePath);
                        allArticles.push({
                            ...articleData,
                            id: articleData.id || file.replace('.json', ''),
                            fileName: file,
                            filePath: filePath,
                            status: 'published'
                        });
                    }
                }
            } catch (error) {
                logger.debug('读取已发布目录失败:', error.message);
            }

            // 按创建时间排序
            allArticles.sort((a, b) => {
                const dateA = new Date(a.createdAt || a.scheduledTime || '1970-01-01');
                const dateB = new Date(b.createdAt || b.scheduledTime || '1970-01-01');
                return dateB.getTime() - dateA.getTime();
            });

            return allArticles;
        } catch (error) {
            logger.error('获取所有文章失败:', error);
            return [];
        }
    }

    /**
     * 根据ID获取文章
     */
    async getArticleById(articleId) {
        try {
            const allArticles = await this.getAllArticles();
            return allArticles.find(article => article.id === articleId);
        } catch (error) {
            logger.error('根据ID获取文章失败:', error);
            return null;
        }
    }

    /**
     * 保存文章
     */
    async saveArticle(article) {
        try {
            // 确定保存目录
            const isPublished = article.status === 'published';
            const saveDir = isPublished ? this.publishedDir : this.draftsDir;

            // 生成文件名
            const fileName = article.fileName || `${article.id || 'article-' + Date.now()}.json`;
            const filePath = path.join(saveDir, fileName);

            // 添加文件信息到文章对象
            const articleWithMeta = {
                ...article,
                fileName: fileName,
                filePath: filePath,
                updatedAt: new Date().toISOString()
            };

            // 保存文件
            await fs.writeJson(filePath, articleWithMeta, { spaces: 2 });

            logger.info(`文章已保存: ${fileName}`);
            return articleWithMeta;
        } catch (error) {
            logger.error('保存文章失败:', error);
            throw error;
        }
    }

    /**
     * 删除文章
     */
    async deleteArticle(articleId) {
        try {
            const article = await this.getArticleById(articleId);
            if (!article) {
                throw new Error('文章不存在');
            }

            // 删除文件
            if (article.filePath && await fs.pathExists(article.filePath)) {
                await fs.remove(article.filePath);
                logger.info(`文章文件已删除: ${article.fileName}`);
            }

            return true;
        } catch (error) {
            logger.error('删除文章失败:', error);
            throw error;
        }
    }

    /**
     * 创建示例文章
     */
    async createSampleArticle() {
        try {
            const sampleArticle = {
                id: `sample-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                title: "我的第一篇自动发布文章",
                subtitle: "使用Vercel + Puppeteer实现Medium自动发布",
                content: `
这是一篇通过自动化系统发布的示例文章。

## 功能特点

1. **自动化发布** - 无需手动操作
2. **定时任务** - 按预设时间发布
3. **标签管理** - 自动添加相关标签

## 技术栈

- Vercel - 无服务器部署平台
- Puppeteer - 浏览器自动化工具
- Node.js - 后端运行环境

感谢您的阅读！这个系统让内容创作者可以专注于写作，而不用担心发布的时间安排。
        `.trim(),
                tags: ["技术", "自动化", "Medium"],
                scheduledTime: new Date(Date.now() + 60000).toISOString(), // 1分钟后发布
                status: "pending",
                createdAt: new Date().toISOString(),
                source: "sample"
            };

            return await this.saveArticle(sampleArticle);
        } catch (error) {
            logger.error('创建示例文章失败:', error);
            throw error;
        }
    }
}

/**
 * 时间工具
 */
class TimeUtils {
    /**
     * 检查是否到了发布时间
     */
    static isTimeToPublish(scheduledTime) {
        if (!scheduledTime) return true; // 如果没有设置时间，则立即发布

        const now = new Date();
        const scheduled = new Date(scheduledTime);
        return now >= scheduled;
    }

    /**
     * 格式化发布时间
     */
    static formatPublishTime(time) {
        try {
            return format(new Date(time), 'yyyy年MM月dd日 HH:mm');
        } catch (error) {
            return '时间格式错误';
        }
    }

    /**
     * 获取下次Cron执行时间
     */
    static getNextCronTime() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0); // 设置为明天上午9点

        return tomorrow;
    }
}

/**
 * API响应工具
 */
class ResponseUtils {
    /**
     * 成功响应
     */
    static success(data = null, message = '操作成功') {
        return {
            success: true,
            message: message,
            data: data,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 错误响应
     */
    static error(message = '操作失败', error = null) {
        return {
            success: false,
            message: message,
            error: error ? error.message : null,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Vercel API响应
     */
    static vercelResponse(res, statusCode, data) {
        return res.status(statusCode).json(data);
    }
}

/**
 * 验证工具
 */
class ValidationUtils {
    /**
     * 验证文章数据
     */
    static validateArticle(article) {
        const errors = [];

        if (!article.title || article.title.trim().length === 0) {
            errors.push('文章标题不能为空');
        }

        if (!article.content || article.content.trim().length === 0) {
            errors.push('文章内容不能为空');
        }

        if (article.title && article.title.length > 100) {
            errors.push('文章标题不能超过100个字符');
        }

        if (article.tags && article.tags.length > 5) {
            errors.push('标签数量不能超过5个');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * 验证API密钥
     * 注意：只有在设置了API_SECRET_KEY环境变量时才进行验证
     * 如果未设置环境变量，应用将允许公开访问
     */
    static validateApiKey(providedKey) {
        const secretKey = process.env.API_SECRET_KEY;
        if (!secretKey) {
            return true; // 如果没有设置密钥，允许访问（公开模式）
        }
        return providedKey === secretKey;
    }
}

// 创建全局实例
const logger = new Logger();
const articleManager = new ArticleManager();

module.exports = {
    Logger,
    ArticleManager,
    TimeUtils,
    ResponseUtils,
    ValidationUtils,
    logger,
    articleManager
}; 