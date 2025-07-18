const fs = require('fs-extra');
const path = require('path');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { logger } = require('./utils');
const OpenAIService = require('./openai-service');

/**
 * 表格文章处理器
 * 支持CSV和XLSX格式的文章批量处理
 */
class TableProcessor {
    constructor(options = {}) {
        this.supportedExtensions = ['.csv', '.xlsx', '.xls'];
        this.requiredColumns = ['标题', '内容', '是否发送'];
        this.optionalColumns = ['标签', '图片链接', '备注'];

        // AI增强配置
        this.enableAIEnhancement = options.enableAIEnhancement !== false; // 默认启用
        this.aiOptions = options.aiOptions || {};

        // 初始化OpenAI服务（如果启用AI增强）
        if (this.enableAIEnhancement) {
            try {
                this.openaiService = new OpenAIService({
                    apiKey: options.openaiApiKey || process.env.OPENAI_API_KEY,
                    baseURL: options.openaiBaseURL || process.env.OPENAI_BASE_URL
                });
                logger.info('TableProcessor: AI增强功能已启用');
            } catch (error) {
                logger.warn('TableProcessor: AI服务初始化失败，将跳过AI增强:', error.message);
                this.openaiService = null;
                this.enableAIEnhancement = false;
            }
        } else {
            this.openaiService = null;
            logger.info('TableProcessor: AI增强功能已禁用');
        }
    }

    /**
     * 读取表格文件并提取文章数据
     * @param {string} filePath 文件路径
     * @returns {Array} 文章数据数组
     */
    async readTableFile(filePath) {
        try {
            if (!await fs.pathExists(filePath)) {
                throw new Error(`文件不存在: ${filePath}`);
            }

            const ext = path.extname(filePath).toLowerCase();

            if (!this.supportedExtensions.includes(ext)) {
                throw new Error(`不支持的文件格式: ${ext}。支持的格式: ${this.supportedExtensions.join(', ')}`);
            }

            logger.info(`正在读取表格文件: ${filePath}`);

            let articles = [];

            if (ext === '.csv') {
                articles = await this.readCSV(filePath);
            } else if (ext === '.xlsx' || ext === '.xls') {
                articles = await this.readExcel(filePath);
            }

            // 验证和清理数据
            articles = this.validateAndCleanData(articles);

            // AI增强处理（在文件读取时进行，而不是发布时）
            if (this.enableAIEnhancement && this.openaiService && articles.length > 0) {
                logger.info('开始对上传的文章进行AI增强处理...');
                articles = await this.enhanceArticlesOnUpload(articles);
            }

            logger.info(`成功读取并处理 ${articles.length} 篇文章数据`);
            return articles;

        } catch (error) {
            logger.error('读取表格文件失败:', error);
            throw error;
        }
    }

    /**
     * 读取CSV文件
     * @param {string} filePath CSV文件路径
     * @returns {Array} 文章数据数组
     */
    async readCSV(filePath) {
        return new Promise((resolve, reject) => {
            const articles = [];

            fs.createReadStream(filePath, { encoding: 'utf8' })
                .pipe(csv())
                .on('data', (row) => {
                    articles.push(row);
                })
                .on('end', () => {
                    resolve(articles);
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    /**
     * 读取Excel文件
     * @param {string} filePath Excel文件路径
     * @returns {Array} 文章数据数组
     */
    async readExcel(filePath) {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0]; // 使用第一个工作表
            const worksheet = workbook.Sheets[sheetName];

            // 转换为JSON格式
            const articles = XLSX.utils.sheet_to_json(worksheet);

            return articles;
        } catch (error) {
            throw new Error(`读取Excel文件失败: ${error.message}`);
        }
    }

    /**
     * 验证和清理数据
     * @param {Array} articles 原始文章数据
     * @returns {Array} 清理后的文章数据
     */
    validateAndCleanData(articles) {
        const cleanedArticles = [];

        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];

            // 检查必需列
            const missingColumns = this.requiredColumns.filter(col => !article.hasOwnProperty(col));
            if (missingColumns.length > 0) {
                logger.warn(`第 ${i + 1} 行缺少必需列: ${missingColumns.join(', ')}`);
                continue;
            }

            // 检查必需字段是否有值
            if (!article['标题'] || !article['内容']) {
                logger.warn(`第 ${i + 1} 行标题或内容为空，跳过`);
                continue;
            }

            // 清理和标准化数据
            const cleanedArticle = {
                index: i + 1,
                title: String(article['标题']).trim(),
                content: String(article['内容']).trim(),
                shouldPublish: this.parseBoolean(article['是否发送']),
                tags: article['标签'] ? String(article['标签']).trim() : '',
                imageUrl: article['图片链接'] ? String(article['图片链接']).trim() : '',
                notes: article['备注'] ? String(article['备注']).trim() : '',
                originalRow: article
            };

            cleanedArticles.push(cleanedArticle);
        }

        return cleanedArticles;
    }

    /**
     * 在文件上传时对文章进行AI增强
     * @param {Array} articles 原始文章数组
     * @returns {Array} 增强后的文章数组
     */
    async enhanceArticlesOnUpload(articles) {
        try {
            logger.info(`开始AI增强处理，共 ${articles.length} 篇文章`);

            const enhancedArticles = [];

            for (let i = 0; i < articles.length; i++) {
                const article = articles[i];

                try {
                    logger.info(`AI增强进度: ${i + 1}/${articles.length} - ${article.title}`);

                    // 转换为OpenAI服务期望的格式
                    const articleForAI = {
                        title: article.title,
                        content: article.content,
                        tags: article.tags
                    };

                    // 进行AI增强
                    const enhancedArticleData = await this.openaiService.enhanceArticle(articleForAI);

                    // 合并增强后的数据
                    const enhancedArticle = {
                        ...article,
                        title: enhancedArticleData.title || article.title,
                        content: enhancedArticleData.content || article.content,
                        tags: enhancedArticleData.tags || article.tags,
                        imageUrl: enhancedArticleData.imageUrl || article.imageUrl,
                        aiEnhanced: enhancedArticleData.aiEnhanced || false,
                        aiEnhancementTime: enhancedArticleData.aiEnhancementTime || new Date().toISOString(),
                        originalContent: article.content // 保存原始内容
                    };

                    enhancedArticles.push(enhancedArticle);

                    // 如果成功增强，记录日志
                    if (enhancedArticleData.aiEnhanced) {
                        logger.info(`✅ 文章 "${article.title}" AI增强成功`);
                    } else {
                        logger.warn(`⚠️ 文章 "${article.title}" AI增强失败，使用原始内容`);
                    }

                    // 避免频繁请求，添加延迟
                    if (i < articles.length - 1) {
                        await this.delay(1000); // 1秒延迟
                    }

                } catch (error) {
                    logger.error(`文章 "${article.title}" AI增强出错:`, error.message);

                    // AI增强失败时使用原始文章
                    enhancedArticles.push({
                        ...article,
                        aiEnhanced: false,
                        aiError: error.message
                    });
                }
            }

            const successCount = enhancedArticles.filter(a => a.aiEnhanced).length;
            logger.info(`AI增强完成: ${successCount}/${articles.length} 篇文章成功增强`);

            return enhancedArticles;

        } catch (error) {
            logger.error('批量AI增强失败:', error);
            // 出错时返回原始文章，不中断流程
            return articles.map(article => ({
                ...article,
                aiEnhanced: false,
                aiError: error.message
            }));
        }
    }

    /**
     * 延迟执行
     * @param {number} ms 延迟毫秒数
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 解析布尔值
     * @param {*} value 待解析的值
     * @returns {boolean} 布尔值
     */
    parseBoolean(value) {
        if (typeof value === 'boolean') {
            return value;
        }

        const stringValue = String(value).toLowerCase().trim();
        return ['是', 'yes', 'true', '1', 'y'].includes(stringValue);
    }

    /**
     * 更新表格文件中的发送状态
     * @param {string} filePath 文件路径
     * @param {number} rowIndex 行索引（从1开始）
     * @param {boolean} published 是否已发送
     */
    async updatePublishStatus(filePath, rowIndex, published = true) {
        try {
            const ext = path.extname(filePath).toLowerCase();

            if (ext === '.csv') {
                await this.updateCSVStatus(filePath, rowIndex, published);
            } else if (ext === '.xlsx' || ext === '.xls') {
                await this.updateExcelStatus(filePath, rowIndex, published);
            }

            logger.info(`已更新第 ${rowIndex} 行的发送状态为: ${published ? '是' : '否'}`);

        } catch (error) {
            logger.error(`更新发送状态失败 (第${rowIndex}行):`, error);
            throw error;
        }
    }

    /**
     * 更新CSV文件的发送状态
     * @param {string} filePath CSV文件路径
     * @param {number} rowIndex 行索引
     * @param {boolean} published 是否已发送
     */
    async updateCSVStatus(filePath, rowIndex, published) {
        // 读取所有数据
        const articles = await this.readCSV(filePath);

        // 更新指定行
        if (articles[rowIndex - 1]) {
            articles[rowIndex - 1]['是否发送'] = published ? '是' : '否';
        }

        // 重写文件
        const headers = Object.keys(articles[0] || {});
        const csvWriter = createCsvWriter({
            path: filePath,
            header: headers.map(h => ({ id: h, title: h })),
            encoding: 'utf8'
        });

        await csvWriter.writeRecords(articles);
    }

    /**
     * 更新Excel文件的发送状态
     * @param {string} filePath Excel文件路径
     * @param {number} rowIndex 行索引
     * @param {boolean} published 是否已发送
     */
    async updateExcelStatus(filePath, rowIndex, published) {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // 找到"是否发送"列
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        let publishColumnIndex = -1;

        // 查找标题行中的"是否发送"列
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
            const cell = worksheet[cellAddress];
            if (cell && cell.v === '是否发送') {
                publishColumnIndex = col;
                break;
            }
        }

        if (publishColumnIndex === -1) {
            throw new Error('未找到"是否发送"列');
        }

        // 更新指定行的值（+1因为从第2行开始是数据行）
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: publishColumnIndex });
        worksheet[cellAddress] = { v: published ? '是' : '否', t: 's' };

        // 写回文件
        XLSX.writeFile(workbook, filePath);
    }

    /**
     * 创建示例表格文件
     * @param {string} filePath 输出文件路径
     * @param {string} format 格式 'csv' 或 'xlsx'
     */
    async createSampleFile(filePath, format = 'csv') {
        const sampleData = [
            {
                '标题': '如何提高编程效率',
                '内容': '编程效率是每个开发者都关心的话题。本文将分享一些实用的技巧和工具，帮助你在日常编程工作中提高效率。\n\n首先，选择合适的开发环境非常重要...',
                '是否发送': '否',
                '标签': '编程,效率,开发',
                '图片链接': '',
                '备注': '示例文章1'
            },
            {
                '标题': 'JavaScript异步编程最佳实践',
                '内容': '异步编程是JavaScript的核心特性之一。掌握Promise、async/await等异步编程模式，可以让你编写出更优雅、更高效的代码。\n\n本文将详细介绍...',
                '是否发送': '否',
                '标签': 'JavaScript,异步编程,Promise',
                '图片链接': '',
                '备注': '示例文章2'
            }
        ];

        if (format === 'csv') {
            const csvWriter = createCsvWriter({
                path: filePath,
                header: [
                    { id: '标题', title: '标题' },
                    { id: '内容', title: '内容' },
                    { id: '是否发送', title: '是否发送' },
                    { id: '标签', title: '标签' },
                    { id: '图片链接', title: '图片链接' },
                    { id: '备注', title: '备注' }
                ],
                encoding: 'utf8'
            });

            await csvWriter.writeRecords(sampleData);
        } else if (format === 'xlsx') {
            const worksheet = XLSX.utils.json_to_sheet(sampleData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, '文章列表');
            XLSX.writeFile(workbook, filePath);
        }

        logger.info(`已创建示例${format.toUpperCase()}文件: ${filePath}`);
    }

    /**
     * 获取待发送的文章列表
     * @param {Array} articles 所有文章数据
     * @returns {Array} 待发送的文章列表
     */
    getPendingArticles(articles) {
        return articles.filter(article => article.shouldPublish);
    }

    /**
     * 获取表格文件统计信息
     * @param {Array} articles 文章数据
     * @returns {Object} 统计信息
     */
    getStatistics(articles) {
        const total = articles.length;
        const pending = articles.filter(a => a.shouldPublish).length;
        const completed = articles.filter(a => !a.shouldPublish).length;
        const withTags = articles.filter(a => a.tags).length;
        const withImages = articles.filter(a => a.imageUrl).length;

        return {
            total,
            pending,
            completed,
            withTags,
            withImages,
            completionRate: total > 0 ? (completed / total * 100).toFixed(1) : 0
        };
    }
}

module.exports = TableProcessor; 