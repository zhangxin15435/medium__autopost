const { OpenAI } = require('openai');
const { logger } = require('./utils');

/**
 * OpenAI文章处理服务
 * 使用GPT-4.1来格式化文章内容、生成标签和添加图片链接
 */
class OpenAIService {
    constructor(options = {}) {
        this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
        this.baseURL = options.baseURL || process.env.OPENAI_BASE_URL;
        this.model = options.model || 'gpt-4.1';

        if (!this.apiKey) {
            throw new Error('OpenAI API Key未配置');
        }

        this.client = new OpenAI({
            apiKey: this.apiKey,
            baseURL: this.baseURL
        });

        logger.info('OpenAI服务初始化完成');
    }

    /**
     * 格式化文章内容并生成标签
     * @param {Object} article 文章对象
     * @returns {Object} 格式化后的文章对象
     */
    async enhanceArticle(article) {
        try {
            logger.info(`正在使用GPT-4.1增强文章: ${article.title}`);

            // 构建提示词
            const prompt = this.buildEnhancementPrompt(article);

            // 调用OpenAI API
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: '你是一个专业的技术文章编辑助手。你的任务是优化文章格式，生成合适的标签，并推荐相关的图片。请确保输出格式严格按照JSON格式。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 4000
            });

            // 解析响应
            const enhancedData = this.parseEnhancementResponse(response.choices[0].message.content);

            // 合并增强数据
            const enhancedArticle = {
                ...article,
                content: enhancedData.formattedContent || article.content,
                tags: enhancedData.tags || article.tags,
                imageUrl: enhancedData.imageUrl || article.imageUrl,
                aiEnhanced: true,
                aiEnhancementTime: new Date().toISOString()
            };

            logger.info(`文章增强完成: ${article.title}`);
            return enhancedArticle;

        } catch (error) {
            logger.error(`文章增强失败 (${article.title}):`, error);
            // 返回原文章，不中断流程
            return {
                ...article,
                aiEnhanced: false,
                aiError: error.message
            };
        }
    }

    /**
     * 构建文章增强提示词
     * @param {Object} article 原始文章
     * @returns {string} 提示词
     */
    buildEnhancementPrompt(article) {
        return `
请对以下文章进行优化和增强，并严格按照JSON格式返回结果：

**原始文章信息：**
标题：${article.title}
内容：${article.content}
现有标签：${article.tags || '无'}
现有图片链接：${article.imageUrl || '无'}

**要求：**
1. **格式化内容**：
   - 优化文章结构，添加适当的段落分隔
   - 改善表达方式，使其更流畅易读
   - 保持原意不变，只优化表达和格式
   - 适当添加标题和小标题（使用Markdown格式）
   - 确保内容适合Medium平台发布

2. **生成标签**：
   - 根据文章内容生成3-5个相关标签
   - 标签要准确反映文章主题
   - 优先使用常见的技术标签
   - 用逗号分隔标签

3. **推荐图片**：
   - 根据文章主题推荐一个合适的图片搜索关键词
   - 关键词要具体、明确
   - 适合作为文章的头图或配图

**返回格式（必须是有效的JSON）：**
{
  "formattedContent": "格式化后的文章内容",
  "tags": "标签1,标签2,标签3",
  "imageUrl": "推荐的图片搜索关键词",
  "summary": "文章优化总结"
}

请确保返回的是纯JSON格式，不要添加任何其他文字或格式化。
`;
    }

    /**
     * 解析AI增强响应
     * @param {string} responseContent AI响应内容
     * @returns {Object} 解析后的数据
     */
    parseEnhancementResponse(responseContent) {
        try {
            // 尝试直接解析JSON
            const data = JSON.parse(responseContent);
            return data;
        } catch (error) {
            logger.warn('解析AI响应失败，尝试提取JSON:', error.message);

            // 尝试提取JSON部分
            const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch (innerError) {
                    logger.error('提取JSON失败:', innerError.message);
                }
            }

            // 返回空对象，表示解析失败
            return {};
        }
    }

    /**
     * 批量增强文章
     * @param {Array} articles 文章数组
     * @param {Object} options 选项
     * @returns {Array} 增强后的文章数组
     */
    async enhanceArticlesBatch(articles, options = {}) {
        const {
            maxConcurrency = 3, // 最大并发数
            delayBetweenRequests = 1000, // 请求间隔（毫秒）
            onProgress = null // 进度回调
        } = options;

        logger.info(`开始批量增强 ${articles.length} 篇文章`);

        const enhancedArticles = [];

        // 分批处理以控制并发
        for (let i = 0; i < articles.length; i += maxConcurrency) {
            const batch = articles.slice(i, i + maxConcurrency);

            // 并发处理当前批次
            const batchPromises = batch.map(async (article, index) => {
                const globalIndex = i + index;

                try {
                    const enhanced = await this.enhanceArticle(article);

                    // 调用进度回调
                    if (onProgress) {
                        onProgress(globalIndex + 1, articles.length, enhanced);
                    }

                    return enhanced;
                } catch (error) {
                    logger.error(`批量处理失败 (第${globalIndex + 1}篇):`, error);
                    return {
                        ...article,
                        aiEnhanced: false,
                        aiError: error.message
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            enhancedArticles.push(...batchResults);

            // 批次间延迟
            if (i + maxConcurrency < articles.length && delayBetweenRequests > 0) {
                await this.delay(delayBetweenRequests);
            }
        }

        logger.info(`批量增强完成，成功处理 ${enhancedArticles.filter(a => a.aiEnhanced).length}/${articles.length} 篇文章`);
        return enhancedArticles;
    }

    /**
     * 生成图片搜索关键词
     * @param {string} title 文章标题
     * @param {string} content 文章内容
     * @returns {string} 图片搜索关键词
     */
    async generateImageKeywords(title, content) {
        try {
            const prompt = `
根据以下文章标题和内容，生成一个适合搜索配图的关键词：

标题：${title}
内容摘要：${content.substring(0, 500)}...

要求：
1. 关键词要具体、明确
2. 适合作为图片搜索关键词
3. 与文章主题高度相关
4. 只返回关键词，不要其他内容

关键词：`;

            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.5,
                max_tokens: 50
            });

            return response.choices[0].message.content.trim();

        } catch (error) {
            logger.error('生成图片关键词失败:', error);
            return '技术文章配图';
        }
    }

    /**
     * 验证和优化标签
     * @param {string} tags 原始标签字符串
     * @param {string} title 文章标题
     * @returns {string} 优化后的标签
     */
    async optimizeTags(tags, title) {
        try {
            const prompt = `
请优化以下标签，使其更适合Medium平台：

文章标题：${title}
现有标签：${tags}

要求：
1. 保持3-5个标签
2. 使用常见的技术标签
3. 确保标签准确反映文章内容
4. 用逗号分隔
5. 只返回标签，不要其他内容

优化后的标签：`;

            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 100
            });

            return response.choices[0].message.content.trim();

        } catch (error) {
            logger.error('优化标签失败:', error);
            return tags; // 返回原标签
        }
    }

    /**
     * 检查API连接
     * @returns {boolean} 连接状态
     */
    async testConnection() {
        try {
            logger.info('正在测试OpenAI API连接...');

            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: '请简单回复"测试成功"'
                    }
                ],
                max_tokens: 10
            });

            const success = response.choices && response.choices.length > 0;
            logger.info(success ? 'OpenAI API连接测试成功' : 'OpenAI API连接测试失败');
            return success;

        } catch (error) {
            logger.error('OpenAI API连接测试失败:', error);
            return false;
        }
    }

    /**
     * 获取使用统计
     * @returns {Object} 使用统计信息
     */
    getUsageStats() {
        // 这里可以添加使用统计逻辑
        return {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalTokensUsed: 0
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

module.exports = OpenAIService; 