const multer = require('multer');
const { logger } = require('../lib/utils');

// 使用内存存储，避免文件系统权限问题
const memoryStorage = multer.memoryStorage();
const upload = multer({
    storage: memoryStorage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB限制
    }
});

// 简化版的上传API处理函数
module.exports = async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 只处理POST请求
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method Not Allowed'
        });
    }

    // 使用multer中间件处理文件上传
    upload.single('table')(req, res, async (err) => {
        try {
            if (err) {
                logger.error('文件上传错误:', err);
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }

            if (!req.file) {
                logger.error('没有接收到文件');
                return res.status(400).json({
                    success: false,
                    error: '请选择要上传的文件'
                });
            }

            logger.info(`接收到上传文件: ${req.file.originalname} (${req.file.size} 字节)`);
            logger.info(`文件MIME类型: ${req.file.mimetype}`);

            // 简单返回文件信息，不进行实际处理
            return res.status(200).json({
                success: true,
                message: '文件上传成功',
                file: {
                    originalname: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    buffer: `${req.file.buffer.length} 字节的数据`
                }
            });
        } catch (error) {
            logger.error('处理上传请求失败:', error);
            return res.status(500).json({
                success: false,
                error: `服务器错误: ${error.message}`
            });
        }
    });
}; 