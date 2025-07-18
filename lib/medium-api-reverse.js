const axios = require('axios');
const { logger } = require('./utils');
const fs = require('fs-extra');
const path = require('path');
const FormData = require('form-data');

/**
 * Medium 逆向分析自动发布器
 * 通过分析Medium的GraphQL接口和API调用实现自动发布
 */
class MediumReversePublisher {
    constructor(options = {}) {
        this.baseURL = 'https://medium.com';
        this.graphqlURL = 'https://medium.com/_/graphql';
        this.apiURL = 'https://api.medium.com/v1';

        // 用户认证信息
        this.integrationToken = options.integrationToken || process.env.MEDIUM_INTEGRATION_TOKEN;
        this.sessionCookies = null;
        this.xsrfToken = null;
        this.userId = null;

        // HTTP客户端配置
        this.httpClient = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Content-Type': 'application/json'
            }
        });

        // 用于存储cookie的文件路径
        this.cookieFile = path.join(process.cwd(), 'cookies.json');
    }

    /**
     * 初始化发布器 - 设置认证和会话
     */
    async init() {
        try {
            logger.info('初始化Medium逆向发布器...');

            // 优先使用Integration Token（如果可用）
            if (this.integrationToken) {
                logger.info('使用Integration Token进行认证...');
                await this.initWithIntegrationToken();
            } else {
                logger.info('使用Cookie认证方式...');
                await this.initWithCookies();
            }

            logger.info('逆向发布器初始化成功');
            return true;
        } catch (error) {
            logger.error('逆向发布器初始化失败:', error.message);
            throw error;
        }
    }

    /**
     * 使用Integration Token初始化（官方API方式）
     */
    async initWithIntegrationToken() {
        try {
            // 设置认证头
            this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.integrationToken}`;
            this.httpClient.defaults.headers.common['Host'] = 'api.medium.com';
            this.httpClient.defaults.headers.common['Accept-Charset'] = 'utf-8';

            // 获取用户信息
            const response = await this.httpClient.get(`${this.apiURL}/me`);

            if (response.status === 200 && response.data.data) {
                this.userId = response.data.data.id;
                logger.info(`Integration Token认证成功，用户ID: ${this.userId}`);
                return true;
            } else {
                throw new Error('Integration Token无效或已过期');
            }
        } catch (error) {
            logger.error('Integration Token认证失败:', error.message);
            throw new Error('Integration Token认证失败，请检查token是否有效');
        }
    }

    /**
     * 使用Cookie初始化（逆向方式）
     */
    async initWithCookies() {
        try {
            // 加载保存的Cookie
            if (await fs.pathExists(this.cookieFile)) {
                const cookieData = await fs.readJson(this.cookieFile);
                await this.setCookies(cookieData);
                logger.info('已加载保存的Cookie');
            } else {
                throw new Error('未找到Cookie文件，请先登录Medium并导出Cookie');
            }

            // 验证Cookie有效性并获取用户信息
            await this.validateCookiesAndGetUser();

            // 获取XSRF Token（用于GraphQL请求）
            await this.getXsrfToken();

            return true;
        } catch (error) {
            logger.error('Cookie认证失败:', error.message);
            throw error;
        }
    }

    /**
     * 设置Cookie到HTTP客户端
     */
    async setCookies(cookieData) {
        try {
            let cookieString = '';

            if (Array.isArray(cookieData)) {
                // 直接的Cookie数组格式
                cookieString = cookieData
                    .map(cookie => `${cookie.name}=${cookie.value}`)
                    .join('; ');
                logger.info(`处理直接Cookie数组，共 ${cookieData.length} 个Cookie`);
            } else if (cookieData && cookieData.cookies && Array.isArray(cookieData.cookies)) {
                // 嵌套格式：{ cookies: [...] }
                cookieString = cookieData.cookies
                    .map(cookie => `${cookie.name}=${cookie.value}`)
                    .join('; ');
                logger.info(`处理嵌套Cookie格式，共 ${cookieData.cookies.length} 个Cookie`);
            } else if (cookieData && cookieData.importantCookies && Array.isArray(cookieData.importantCookies)) {
                // 重要Cookie格式：{ importantCookies: [...] }
                cookieString = cookieData.importantCookies
                    .map(cookie => `${cookie.name}=${cookie.value}`)
                    .join('; ');
                logger.info(`处理重要Cookie格式，共 ${cookieData.importantCookies.length} 个Cookie`);
            } else if (typeof cookieData === 'string') {
                // Cookie字符串格式
                cookieString = cookieData;
                logger.info('处理Cookie字符串格式');
            } else {
                logger.error('Cookie数据格式详情:', {
                    type: typeof cookieData,
                    isArray: Array.isArray(cookieData),
                    keys: cookieData ? Object.keys(cookieData) : [],
                    sample: cookieData
                });
                throw new Error('不支持的Cookie格式，请检查cookies.json文件格式');
            }

            if (!cookieString || cookieString.trim() === '') {
                throw new Error('Cookie字符串为空，无法进行认证');
            }

            // 设置Cookie到HTTP客户端
            this.httpClient.defaults.headers.common['Cookie'] = cookieString;
            this.sessionCookies = cookieString;

            // 记录关键Cookie（用于调试）
            const keyWords = ['sid', 'uid', 'xsrf', 'cf_clearance'];
            const keyCookies = keyWords.filter(keyword =>
                cookieString.includes(keyword)
            );

            logger.info(`Cookie设置成功，包含关键认证Cookie: [${keyCookies.join(', ')}]`);

        } catch (error) {
            logger.error('设置Cookie失败:', error.message);
            throw error;
        }
    }

    /**
 * 验证Cookie并获取用户信息
 */
    async validateCookiesAndGetUser() {
        try {
            // 尝试访问Medium的用户相关API来验证Cookie
            let userInfo = null;

            // 方法1: 尝试访问用户配置页面
            try {
                logger.info('尝试访问用户配置页面验证Cookie...');
                const response = await this.httpClient.get(`${this.baseURL}/me/settings`, {
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });

                if (response.status === 200) {
                    await this.extractUserInfoFromPage(response.data);
                    logger.info('Cookie验证成功（通过用户配置页面）');
                    return;
                }
            } catch (error) {
                logger.warn('用户配置页面访问失败:', error.message);
            }

            // 方法2: 尝试访问主页
            try {
                logger.info('尝试访问Medium主页验证Cookie...');
                const response = await this.httpClient.get(this.baseURL, {
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });

                if (response.status === 200) {
                    await this.extractUserInfoFromPage(response.data);
                    logger.info('Cookie验证成功（通过主页）');
                    return;
                }
            } catch (error) {
                logger.warn('主页访问失败:', error.message);
            }

            // 方法3: 尝试访问API端点获取用户信息
            try {
                logger.info('尝试通过API获取用户信息...');
                const response = await this.httpClient.get(`${this.baseURL}/_/api/users/self`, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });

                if (response.status === 200) {
                    // 处理Medium的防护前缀
                    let data = response.data;
                    if (typeof data === 'string' && data.startsWith('])}while(1);</x>')) {
                        data = JSON.parse(data.substring(11));
                    }

                    if (data && data.payload && data.payload.user) {
                        this.userId = data.payload.user.id;
                        logger.info(`API验证成功，用户ID: ${this.userId}`);
                        return;
                    }
                }
            } catch (error) {
                logger.warn('API用户信息获取失败:', error.message);
            }

            // 如果所有方法都失败，但没有严重错误，仍然认为Cookie基本有效
            logger.warn('无法完全验证用户信息，但Cookie已设置，将继续尝试发布');

        } catch (error) {
            logger.error('Cookie验证失败:', error.message);
            throw error;
        }
    }

    /**
     * 从页面HTML中提取用户信息
     */
    async extractUserInfoFromPage(html) {
        try {
            // 使用多种模式提取用户信息
            const patterns = [
                /"userId":"([^"]+)"/,
                /"currentUserId":"([^"]+)"/,
                /window\.__APOLLO_STATE__.*"User:([^"]+)"/,
                /"viewer":\s*{\s*"user":\s*{\s*"id":\s*"([^"]+)"/
            ];

            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    this.userId = match[1];
                    logger.info(`成功提取用户ID: ${this.userId}`);
                    return;
                }
            }

            logger.warn('未能从页面提取用户ID，将在后续步骤中尝试其他方法');
        } catch (error) {
            logger.warn('用户信息提取失败:', error.message);
        }
    }

    /**
 * 获取XSRF Token（用于POST请求）
 */
    async getXsrfToken() {
        try {
            // 先尝试从Cookie中提取XSRF Token
            if (this.sessionCookies) {
                const xsrfCookieMatch = this.sessionCookies.match(/xsrf=([^;]+)/);
                if (xsrfCookieMatch) {
                    this.xsrfToken = xsrfCookieMatch[1];
                    this.httpClient.defaults.headers.common['X-Xsrf-Token'] = this.xsrfToken;
                    logger.info('从Cookie中成功提取XSRF Token');
                    return;
                }
            }

            // 如果Cookie中没有，再从页面提取
            logger.info('从页面获取XSRF Token...');
            const response = await this.httpClient.get(`${this.baseURL}/new-story`);

            // 使用多种模式提取XSRF token
            const patterns = [
                /"xsrfToken":"([^"]+)"/,
                /"csrf_token":"([^"]+)"/,
                /window\.__CSRF_TOKEN__\s*=\s*"([^"]+)"/,
                /name="_token"[^>]*value="([^"]+)"/
            ];

            for (const pattern of patterns) {
                const match = response.data.match(pattern);
                if (match && match[1]) {
                    this.xsrfToken = match[1];
                    this.httpClient.defaults.headers.common['X-Xsrf-Token'] = this.xsrfToken;
                    logger.info('从页面成功提取XSRF Token');
                    return;
                }
            }

            logger.warn('XSRF Token获取失败，可能影响POST请求');
        } catch (error) {
            logger.warn('XSRF Token获取失败:', error.message);
        }
    }

    /**
     * 发布文章 - 主要方法
     * @param {Object} article 文章对象
     */
    async publishArticle(article) {
        try {
            logger.info(`开始发布文章: ${article.title}`);

            let result;

            // 根据认证方式选择发布方法
            if (this.integrationToken) {
                result = await this.publishWithIntegrationToken(article);
            } else {
                result = await this.publishWithGraphQL(article);
            }

            logger.info(`文章《${article.title}》发布成功！`);
            return result;

        } catch (error) {
            logger.error(`发布文章失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 使用Integration Token发布文章
     */
    async publishWithIntegrationToken(article) {
        try {
            const publishData = {
                title: article.title,
                contentFormat: 'markdown', // 支持 'html', 'markdown'
                content: article.content,
                tags: article.tags || [],
                publishStatus: 'public', // 'public' 或 'draft'
                license: 'all-rights-reserved',
                notifyFollowers: true
            };

            // 添加副标题（如果有）
            if (article.subtitle) {
                publishData.content = `## ${article.subtitle}\n\n${publishData.content}`;
            }

            const response = await this.httpClient.post(
                `${this.apiURL}/users/${this.userId}/posts`,
                publishData
            );

            if (response.status === 201 && response.data.data) {
                return {
                    success: true,
                    id: response.data.data.id,
                    url: response.data.data.url,
                    title: response.data.data.title,
                    publishedAt: response.data.data.publishedAt || new Date().toISOString()
                };
            } else {
                throw new Error('发布响应格式异常');
            }

        } catch (error) {
            logger.error('Integration Token发布失败:', error.message);
            throw error;
        }
    }

    /**
     * 使用GraphQL发布文章（逆向分析方式）
     */
    async publishWithGraphQL(article) {
        try {
            logger.info('使用GraphQL方式发布文章...');

            // 1. 先创建草稿
            const draftResult = await this.createDraftWithGraphQL(article);

            // 2. 发布草稿
            const publishResult = await this.publishDraftWithGraphQL(draftResult.id);

            return {
                success: true,
                id: publishResult.id,
                url: publishResult.url,
                title: article.title,
                publishedAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error('GraphQL发布失败:', error.message);
            throw error;
        }
    }

    /**
     * 使用Medium的实际API发布文章（增强版逆向分析）
     */
    async createDraftWithGraphQL(article) {
        try {
            logger.info('🔍 开始深度逆向分析API发布...');

            // 方法1: 尝试最新的编辑器API
            try {
                logger.info('📝 尝试编辑器API...');
                return await this.createWithEditorAPI(article);
            } catch (error) {
                logger.warn('编辑器API失败:', error.message);
            }

            // 方法2: 尝试完整的Story创建流程
            try {
                logger.info('📖 尝试Story创建API...');
                return await this.createWithStoryAPI(article);
            } catch (error) {
                logger.warn('Story API失败:', error.message);
            }

            // 方法3: 尝试Medium内部发布API
            try {
                logger.info('🔧 尝试内部API...');
                return await this.createWithInternalAPI(article);
            } catch (error) {
                logger.warn('内部API失败:', error.message);
            }

            // 方法4: 尝试修复的GraphQL
            try {
                logger.info('🎯 尝试GraphQL...');
                return await this.createWithFixedGraphQL(article);
            } catch (error) {
                logger.warn('GraphQL API失败:', error.message);
            }

            // 方法5: 尝试简单POST请求
            try {
                logger.info('📮 尝试直接POST...');
                return await this.createWithDirectPost(article);
            } catch (error) {
                logger.warn('直接POST失败:', error.message);
            }

            // 方法6: 模拟浏览器行为
            try {
                logger.info('🌐 尝试模拟浏览器...');
                return await this.createWithBrowserSimulation(article);
            } catch (error) {
                logger.warn('浏览器模拟失败:', error.message);
            }

            throw new Error('所有API方式都失败了');

        } catch (error) {
            logger.error('创建文章失败:', error.message);
            throw error;
        }
    }

    /**
     * 使用Medium内部API
     */
    async createWithInternalAPI(article) {
        logger.info('尝试Medium内部API...');

        // 构造Medium内部API格式的数据
        const postData = {
            title: article.title,
            contentFormat: 'markdown',
            content: article.content,
            tags: Array.isArray(article.tags) ? article.tags : [],
            publishStatus: 'public',
            license: 'all-rights-reserved',
            notifyFollowers: true
        };

        // 如果有副标题，添加到内容前
        if (article.subtitle) {
            postData.content = `## ${article.subtitle}\n\n${postData.content}`;
        }

        const response = await this.httpClient.post(`${this.baseURL}/_/api/posts`, postData, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Referer': `${this.baseURL}/new-story`,
                'Origin': this.baseURL
            }
        });

        if (response.status === 200 || response.status === 201) {
            logger.info('内部API发布成功');
            return {
                id: response.data.id || Date.now().toString(),
                title: article.title,
                mediumUrl: response.data.url || `${this.baseURL}/p/${Date.now()}`
            };
        }

        throw new Error('内部API响应异常');
    }

    /**
     * 使用修复的GraphQL
     */
    async createWithFixedGraphQL(article) {
        logger.info('尝试修复的GraphQL...');

        // 使用更简单、更符合Medium实际API的格式
        const mutation = `
            mutation($title: String!, $content: String!, $tags: [String!]) {
                createPost(title: $title, content: $content, tags: $tags) {
                    id
                    url
                    title
                }
            }
        `;

        const variables = {
            title: article.title,
            content: article.content,
            tags: article.tags || []
        };

        const response = await this.makeGraphQLRequest(mutation, variables);

        if (response.data && response.data.createPost) {
            logger.info('GraphQL发布成功');
            return {
                id: response.data.createPost.id,
                title: response.data.createPost.title,
                mediumUrl: response.data.createPost.url
            };
        }

        throw new Error('GraphQL响应格式异常');
    }

    /**
     * 使用直接POST请求
     */
    async createWithDirectPost(article) {
        logger.info('尝试直接POST请求...');

        // 模拟浏览器提交文章的POST请求
        const formData = new URLSearchParams();
        formData.append('title', article.title);
        formData.append('content', article.content);
        formData.append('tags', JSON.stringify(article.tags || []));
        formData.append('status', 'public');

        const response = await this.httpClient.post(`${this.baseURL}/p/submit`, formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'Referer': `${this.baseURL}/new-story`,
                'Origin': this.baseURL
            }
        });

        if (response.status === 200 || response.status === 302) {
            logger.info('直接POST发布成功');

            // 从响应中提取文章URL
            let articleUrl = `${this.baseURL}/p/${Date.now()}`;
            if (response.headers.location) {
                articleUrl = response.headers.location;
            } else if (response.data && response.data.url) {
                articleUrl = response.data.url;
            }

            return {
                id: Date.now().toString(),
                title: article.title,
                mediumUrl: articleUrl
            };
        }

        throw new Error('直接POST响应异常');
    }

    /**
     * 使用GraphQL发布草稿
     */
    async publishDraftWithGraphQL(draftId) {
        try {
            const mutation = `
                mutation PublishDraft($input: PublishDraftInput!) {
                    publishDraft(input: $input) {
                        post {
                            id
                            title
                            mediumUrl
                            publishedAt
                        }
                        clientMutationId
                    }
                }
            `;

            const variables = {
                input: {
                    draftId: draftId,
                    notifyFollowers: true,
                    clientMutationId: `publish_draft_${Date.now()}`
                }
            };

            const response = await this.httpClient.post(this.graphqlURL, {
                query: mutation,
                variables: variables
            });

            if (response.data.data && response.data.data.publishDraft) {
                const post = response.data.data.publishDraft.post;
                logger.info(`文章发布成功，URL: ${post.mediumUrl}`);
                return {
                    id: post.id,
                    url: post.mediumUrl,
                    publishedAt: post.publishedAt
                };
            } else {
                throw new Error('GraphQL发布失败');
            }

        } catch (error) {
            logger.error('GraphQL发布草稿失败:', error.message);
            throw error;
        }
    }

    /**
     * 获取用户文章列表（逆向分析）
     */
    async getUserPosts(username, limit = 25) {
        try {
            logger.info(`获取用户 ${username} 的文章列表...`);

            const query = `
                query UserPosts($username: String!, $limit: Int!) {
                    user(username: $username) {
                        id
                        posts(first: $limit) {
                            edges {
                                node {
                                    id
                                    title
                                    subtitle
                                    createdAt
                                    publishedAt
                                    mediumUrl
                                    readingTime
                                    tags
                                }
                            }
                            pageInfo {
                                hasNextPage
                                endCursor
                            }
                        }
                    }
                }
            `;

            const variables = {
                username: username,
                limit: limit
            };

            const response = await this.httpClient.post(this.graphqlURL, {
                query: query,
                variables: variables
            });

            if (response.data.data && response.data.data.user) {
                const posts = response.data.data.user.posts.edges.map(edge => edge.node);
                logger.info(`成功获取 ${posts.length} 篇文章`);
                return posts;
            } else {
                throw new Error('GraphQL查询用户文章失败');
            }

        } catch (error) {
            logger.error('获取用户文章列表失败:', error.message);
            throw error;
        }
    }

    /**
     * 检查文章是否已存在
     */
    async checkArticleExists(title, username) {
        try {
            const posts = await this.getUserPosts(username);
            return posts.some(post => post.title === title);
        } catch (error) {
            logger.warn('检查文章是否存在时出错:', error.message);
            return false;
        }
    }

    /**
     * 完整的发布流程
     */
    async publishFlow(article) {
        try {
            await this.init();
            const result = await this.publishArticle(article);
            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
 * 发送GraphQL请求的通用方法
 */
    async makeGraphQLRequest(query, variables = {}, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const requestData = {
                    query: query,
                    variables: variables
                };

                logger.info(`GraphQL请求尝试 ${attempt}/${retries}`);

                const response = await this.httpClient.post(this.graphqlURL, requestData, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Referer': this.baseURL,
                        'Origin': this.baseURL
                    }
                });

                if (response.data.errors) {
                    throw new Error(`GraphQL错误: ${JSON.stringify(response.data.errors)}`);
                }

                return response.data;

            } catch (error) {
                logger.warn(`GraphQL请求第${attempt}次失败:`, error.message);

                if (attempt === retries) {
                    throw error;
                }

                // 等待后重试
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }

    /**
     * 方法1: 使用编辑器API发布（最新逆向分析）
     */
    async createWithEditorAPI(article) {
        logger.info('📝 尝试编辑器API发布...');

        // 构建内容数据结构
        const contentData = {
            body: {
                sections: [
                    {
                        startIndex: 0,
                        textLayout: 1,
                        imageLayout: 1,
                        backgroundImage: {},
                        videoLayout: 1,
                        backgroundVideo: {}
                    }
                ],
                paragraphs: [
                    {
                        name: this.generateParagraphId(),
                        type: 3, // 标题类型
                        text: article.title,
                        hasDropCap: false
                    },
                    {
                        name: this.generateParagraphId(),
                        type: 1, // 正文类型
                        text: article.content,
                        hasDropCap: false
                    }
                ]
            },
            title: article.title,
            subtitle: article.subtitle || '',
            tags: article.tags || [],
            publishStatus: 'public'
        };

        const response = await this.httpClient.post(`${this.baseURL}/_/api/posts`, contentData, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Referer': `${this.baseURL}/new-story`,
                'Origin': this.baseURL
            }
        });

        if (response.status === 201 || response.status === 200) {
            logger.info('✅ 编辑器API发布成功');

            const data = response.data;
            return {
                id: data.id || Date.now().toString(),
                title: article.title,
                mediumUrl: data.url || `${this.baseURL}/p/${Date.now()}`
            };
        }

        throw new Error('编辑器API响应异常');
    }

    /**
     * 方法2: 使用Story创建API（完整流程）
     */
    async createWithStoryAPI(article) {
        logger.info('📖 尝试Story创建API...');

        // 第一步：创建草稿
        const draftData = {
            title: article.title,
            content: article.content,
            contentFormat: 'markdown',
            status: 'draft'
        };

        const draftResponse = await this.httpClient.post(`${this.baseURL}/_/api/stories`, draftData, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Referer': `${this.baseURL}/new-story`,
                'Origin': this.baseURL
            }
        });

        if (draftResponse.status === 201) {
            const storyId = draftResponse.data.id;

            // 第二步：发布草稿
            const publishData = {
                status: 'public',
                tags: article.tags || []
            };

            const publishResponse = await this.httpClient.put(
                `${this.baseURL}/_/api/stories/${storyId}/publish`,
                publishData,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Referer': `${this.baseURL}/story/${storyId}`,
                        'Origin': this.baseURL
                    }
                }
            );

            if (publishResponse.status === 200) {
                logger.info('✅ Story API发布成功');

                return {
                    id: storyId,
                    title: article.title,
                    mediumUrl: `${this.baseURL}/p/${storyId}`
                };
            }
        }

        throw new Error('Story API创建失败');
    }

    /**
     * 方法6: 模拟浏览器行为发布
     */
    async createWithBrowserSimulation(article) {
        logger.info('🌐 模拟浏览器行为发布...');

        // 模拟浏览器提交表单
        const formData = new FormData();
        formData.append('title', article.title);
        formData.append('content', article.content);
        formData.append('tags', JSON.stringify(article.tags || []));
        formData.append('status', 'public');
        formData.append('license', 'all-rights-reserved');
        formData.append('canonicalUrl', '');

        // 添加CSRF保护
        if (this.xsrfToken) {
            formData.append('_token', this.xsrfToken);
        }

        const response = await this.httpClient.post(`${this.baseURL}/p/submit`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': `${this.baseURL}/new-story`,
                'Origin': this.baseURL
            }
        });

        if (response.status === 200 || response.status === 302) {
            logger.info('✅ 浏览器模拟发布成功');

            // 尝试从响应中提取文章URL
            let articleUrl = null;

            if (response.headers.location) {
                articleUrl = response.headers.location;
            } else if (response.data && typeof response.data === 'string') {
                const urlMatch = response.data.match(/\/p\/([a-f0-9]+)/);
                if (urlMatch) {
                    articleUrl = `${this.baseURL}${urlMatch[0]}`;
                }
            }

            return {
                id: Date.now().toString(),
                title: article.title,
                mediumUrl: articleUrl || `${this.baseURL}/p/unknown`
            };
        }

        throw new Error('浏览器模拟发布失败');
    }

    /**
     * 生成段落ID的辅助方法
     */
    generateParagraphId() {
        return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }

    /**
     * 使用简单API创建文章的备用方法
     */
    async createStoryWithSimpleAPI(article) {
        try {
            logger.info('使用备用API创建文章...');

            // 构造简单的POST请求到Medium的内部API
            const storyData = {
                title: article.title,
                content: article.content,
                contentFormat: 'markdown',
                tags: article.tags || [],
                publishStatus: 'draft'
            };

            // 尝试Medium的内部创建接口
            const response = await this.httpClient.post(`${this.baseURL}/_/api/stories`, storyData, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Referer': `${this.baseURL}/new-story`,
                    'Origin': this.baseURL
                }
            });

            if (response.status === 200 || response.status === 201) {
                logger.info('备用API创建成功');
                return {
                    id: response.data.id || Date.now().toString(),
                    title: article.title,
                    mediumUrl: response.data.url || `${this.baseURL}/p/${Date.now()}`
                };
            } else {
                throw new Error('备用API创建失败');
            }

        } catch (error) {
            logger.error('备用API创建失败:', error.message);
            throw error;
        }
    }

    /**
     * 批量发布文章
     */
    async batchPublish(articles, options = {}) {
        const results = [];
        const delay = options.delay || 5000; // 默认5秒延迟

        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];

            try {
                logger.info(`发布第 ${i + 1}/${articles.length} 篇文章: ${article.title}`);

                const result = await this.publishArticle(article);
                results.push({ ...result, article: article.title });

                // 添加延迟避免频率限制
                if (i < articles.length - 1) {
                    logger.info(`等待 ${delay / 1000} 秒后发布下一篇...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

            } catch (error) {
                logger.error(`发布文章《${article.title}》失败:`, error.message);
                results.push({
                    success: false,
                    error: error.message,
                    article: article.title
                });
            }
        }

        return results;
    }
}

module.exports = MediumReversePublisher; 