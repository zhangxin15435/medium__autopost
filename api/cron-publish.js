const MediumPublisher = require('../lib/medium-publisher');
const {
    logger,
    articleManager,
    TimeUtils,
    ResponseUtils
} = require('../lib/utils');

/**
 * Vercel Cron定时任务API - 自动发布Medium文章
 * 每天上午9点执行（vercel.json中配置）
 */
module.exports = async (req, res) => {
    try {
        logger.info('=== Cron定时任务开始执行 ===');

        // 验证请求方法
        if (req.method !== 'GET' && req.method !== 'POST') {
            return ResponseUtils.vercelResponse(
                res,
                405,
                ResponseUtils.error('不支持的请求方法')
            );
        }

        // 验证是否为Vercel Cron请求
        const cronSecret = req.headers['x-vercel-cron-key'];
        if (process.env.NODE_ENV === 'production' && !cronSecret) {
            logger.warn('未授权的Cron请求尝试');
            return ResponseUtils.vercelResponse(
                res,
                401,
                ResponseUtils.error('未授权的请求')
            );
        }

        // 获取待发布的文章
        const pendingArticles = await articleManager.getPendingArticles();
        logger.info(`找到 ${pendingArticles.length} 篇待发布文章`);

        if (pendingArticles.length === 0) {
            logger.info('没有待发布的文章');
            return ResponseUtils.vercelResponse(
                res,
                200,
                ResponseUtils.success(
                    { publishedCount: 0 },
                    '没有待发布的文章'
                )
            );
        }

        const publishResults = [];
        let successCount = 0;
        let errorCount = 0;

        // 检查环境变量
        if (!process.env.MEDIUM_EMAIL || !process.env.MEDIUM_PASSWORD) {
            logger.error('Medium账户信息未配置');
            return ResponseUtils.vercelResponse(
                res,
                500,
                ResponseUtils.error('Medium账户信息未配置')
            );
        }

        // 逐个处理文章
        for (const article of pendingArticles) {
            try {
                // 检查是否到了发布时间
                if (!TimeUtils.isTimeToPublish(article.scheduledTime)) {
                    logger.info(`文章《${article.title}》未到发布时间: ${TimeUtils.formatPublishTime(article.scheduledTime)}`);
                    continue;
                }

                logger.info(`开始处理文章: ${article.title}`);

                // 创建发布器实例
                const publisher = new MediumPublisher();

                // 执行发布流程
                const publishResult = await publisher.publishFlow(article);

                // 记录成功结果
                publishResults.push({
                    article: article.title,
                    status: 'success',
                    result: publishResult
                });

                // 移动文章到已发布目录
                await articleManager.moveToPublished(article, publishResult);

                successCount++;
                logger.info(`文章《${article.title}》发布成功`);

                // 避免频繁请求，添加延迟
                if (pendingArticles.indexOf(article) < pendingArticles.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }

            } catch (error) {
                errorCount++;
                logger.error(`发布文章《${article.title}》失败:`, error);

                publishResults.push({
                    article: article.title,
                    status: 'error',
                    error: error.message
                });

                // 继续处理下一篇文章
                continue;
            }
        }

        // 返回执行结果
        const responseData = {
            totalArticles: pendingArticles.length,
            successCount: successCount,
            errorCount: errorCount,
            publishResults: publishResults,
            executedAt: new Date().toISOString(),
            nextExecution: TimeUtils.getNextCronTime()
        };

        logger.info(`=== Cron任务执行完成: 成功 ${successCount} 篇，失败 ${errorCount} 篇 ===`);

        return ResponseUtils.vercelResponse(
            res,
            200,
            ResponseUtils.success(responseData, `定时任务执行完成`)
        );

    } catch (error) {
        logger.error('Cron任务执行失败:', error);

        return ResponseUtils.vercelResponse(
            res,
            500,
            ResponseUtils.error('定时任务执行失败', error)
        );
    }
}; 