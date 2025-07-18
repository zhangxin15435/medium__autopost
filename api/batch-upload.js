const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const BatchPublisher = require('../lib/batch-publisher');
const { logger } = require('../lib/utils');

// 配置文件上传
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'uploads');
        await fs.ensureDir(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // 生成唯一文件名
        const timestamp = Date.now();
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const ext = path.extname(originalName);
        const name = path.basename(originalName, ext);
        cb(null, `${name}_${timestamp}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.csv', '.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();

        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`不支持的文件格式: ${ext}。支持的格式: ${allowedExtensions.join(', ')}`));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB限制
    }
});

/**
 * 批量上传和发布API处理函数
 */
class BatchUploadAPI {
    constructor() {
        this.batchPublisher = new BatchPublisher({
            openaiApiKey: process.env.OPENAI_API_KEY,
            openaiBaseURL: process.env.OPENAI_BASE_URL,
            enableAIEnhancementOnUpload: true // 默认在文件上传时启用AI增强
        });
    }

    /**
     * 处理表格文件上传
     */
    async handleUpload(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: '请选择要上传的表格文件'
                });
            }

            const filePath = req.file.path;
            const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

            logger.info(`接收到上传文件: ${originalName}`);

            // 预览表格内容
            const preview = await this.batchPublisher.previewTable(filePath);

            if (!preview.success) {
                // 删除上传的文件
                await fs.remove(filePath);
                return res.status(400).json({
                    success: false,
                    error: preview.error
                });
            }

            res.json({
                success: true,
                message: '文件上传成功',
                data: {
                    filePath: filePath,
                    originalName: originalName,
                    fileSize: req.file.size,
                    uploadTime: new Date().toISOString(),
                    preview: preview
                }
            });

        } catch (error) {
            logger.error('文件上传处理失败:', error);

            // 清理上传的文件
            if (req.file && req.file.path) {
                try {
                    await fs.remove(req.file.path);
                } catch (cleanupError) {
                    logger.error('清理文件失败:', cleanupError);
                }
            }

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * 处理批量发布请求
     */
    async handleBatchPublish(req, res) {
        try {
            const { filePath, options = {} } = req.body;

            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: '请提供文件路径'
                });
            }

            // 检查文件是否存在
            if (!await fs.pathExists(filePath)) {
                return res.status(404).json({
                    success: false,
                    error: '文件不存在'
                });
            }

            logger.info(`开始批量发布处理: ${filePath}`);

            // 设置响应为长连接，支持实时进度更新
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            // 创建进度回调
            const progressCallback = (progress) => {
                res.write(JSON.stringify({
                    type: 'progress',
                    data: progress
                }) + '\n');
            };

            try {
                // 创建专门的BatchPublisher实例，根据用户选择配置AI增强
                const aiEnhancementEnabled = options.enableAIEnhancement !== false; // 默认启用

                const customBatchPublisher = new BatchPublisher({
                    openaiApiKey: process.env.OPENAI_API_KEY,
                    openaiBaseURL: process.env.OPENAI_BASE_URL,
                    enableAIEnhancementOnUpload: aiEnhancementEnabled
                });

                logger.info(`批量发布配置: AI增强=${aiEnhancementEnabled ? '启用' : '禁用'}`);

                // 执行批量发布
                const result = await customBatchPublisher.publishFromTable(filePath, {
                    ...options,
                    progressCallback
                });

                // 发送最终结果
                res.write(JSON.stringify({
                    type: 'result',
                    data: result
                }) + '\n');

                // 清理上传的文件
                try {
                    await fs.remove(filePath);
                    logger.info(`已清理上传文件: ${filePath}`);
                } catch (cleanupError) {
                    logger.warn('清理文件失败:', cleanupError);
                }

            } catch (publishError) {
                res.write(JSON.stringify({
                    type: 'error',
                    data: {
                        success: false,
                        error: publishError.message
                    }
                }) + '\n');
            }

            res.end();

        } catch (error) {
            logger.error('批量发布处理失败:', error);

            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        }
    }

    /**
     * 预览表格内容
     */
    async handlePreview(req, res) {
        try {
            const { filePath } = req.query;

            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: '请提供文件路径'
                });
            }

            const preview = await this.batchPublisher.previewTable(filePath);
            res.json(preview);

        } catch (error) {
            logger.error('预览处理失败:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * 测试AI服务连接
     */
    async handleTestAI(req, res) {
        try {
            const result = await this.batchPublisher.testAIConnection();
            res.json(result);
        } catch (error) {
            logger.error('AI测试失败:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * 创建示例表格文件
     */
    async handleCreateSample(req, res) {
        try {
            const { format = 'csv' } = req.query;
            const timestamp = Date.now();
            const fileName = `sample_${timestamp}.${format}`;
            const outputPath = path.join(process.cwd(), 'uploads', fileName);

            await fs.ensureDir(path.dirname(outputPath));
            const result = await this.batchPublisher.createSampleTable(outputPath, format);

            if (result.success) {
                // 返回文件下载
                res.download(outputPath, fileName, (err) => {
                    if (err) {
                        logger.error('文件下载失败:', err);
                    }
                    // 下载完成后删除文件
                    setTimeout(async () => {
                        try {
                            await fs.remove(outputPath);
                        } catch (cleanupError) {
                            logger.warn('清理示例文件失败:', cleanupError);
                        }
                    }, 60000); // 1分钟后清理
                });
            } else {
                res.status(500).json(result);
            }

        } catch (error) {
            logger.error('创建示例文件失败:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * 获取支持的文件格式
     */
    async handleGetFormats(req, res) {
        try {
            const formats = this.batchPublisher.getSupportedFormats();
            res.json({
                success: true,
                formats: formats,
                description: {
                    '.csv': 'CSV逗号分隔文件',
                    '.xlsx': 'Excel工作簿文件',
                    '.xls': 'Excel旧版文件'
                }
            });
        } catch (error) {
            logger.error('获取格式信息失败:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

/**
 * Vercel API 路由处理函数
 */
module.exports = async (req, res) => {
    const api = new BatchUploadAPI();
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);

    try {
        // 设置CORS头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
        }

        switch (pathname) {
            case '/api/batch-upload':
                if (req.method === 'POST') {
                    // 使用multer中间件处理文件上传
                    upload.single('table')(req, res, (err) => {
                        if (err) {
                            return res.status(400).json({
                                success: false,
                                error: err.message
                            });
                        }
                        api.handleUpload(req, res);
                    });
                } else {
                    res.status(405).json({ error: 'Method not allowed' });
                }
                break;

            case '/api/batch-publish':
                if (req.method === 'POST') {
                    await api.handleBatchPublish(req, res);
                } else {
                    res.status(405).json({ error: 'Method not allowed' });
                }
                break;

            case '/api/table-preview':
                if (req.method === 'GET') {
                    await api.handlePreview(req, res);
                } else {
                    res.status(405).json({ error: 'Method not allowed' });
                }
                break;

            case '/api/test-ai':
                if (req.method === 'GET') {
                    await api.handleTestAI(req, res);
                } else {
                    res.status(405).json({ error: 'Method not allowed' });
                }
                break;

            case '/api/sample-table':
                if (req.method === 'GET') {
                    await api.handleCreateSample(req, res);
                } else {
                    res.status(405).json({ error: 'Method not allowed' });
                }
                break;

            case '/api/supported-formats':
                if (req.method === 'GET') {
                    await api.handleGetFormats(req, res);
                } else {
                    res.status(405).json({ error: 'Method not allowed' });
                }
                break;

            default:
                res.status(404).json({ error: 'API endpoint not found' });
                break;
        }

    } catch (error) {
        logger.error('API处理失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}; 