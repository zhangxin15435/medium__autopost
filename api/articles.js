const { logger } = require('../lib/utils');

// 简单的文章列表API
module.exports = async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 只处理GET请求
    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'Method Not Allowed'
        });
    }

    try {
        logger.info('接收到文章列表请求');

        // 创建一些示例文章数据
        const sampleArticles = [
            {
                id: '1',
                title: '示例文章1',
                subtitle: '这是一个示例副标题',
                content: '这是示例文章的内容...',
                tags: ['示例', '测试'],
                createdAt: new Date().toISOString(),
                status: 'imported'
            },
            {
                id: '2',
                title: '示例文章2',
                subtitle: '另一个示例副标题',
                content: '这是另一篇示例文章的内容...',
                tags: ['示例', '文章'],
                createdAt: new Date(Date.now() - 86400000).toISOString(), // 昨天
                status: 'published'
            }
        ];

        // 返回文章列表
        return res.status(200).json({
            success: true,
            articles: sampleArticles
        });
    } catch (error) {
        logger.error('获取文章列表失败:', error);
        return res.status(500).json({
            success: false,
            error: `服务器错误: ${error.message}`
        });
    }
}; 