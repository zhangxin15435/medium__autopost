/**
 * 精确API测试工具
 * 基于深度分析结果，测试发现的发布相关API端点和正确的GraphQL查询
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../lib/utils');

class PreciseAPITest {
    constructor() {
        this.baseURL = 'https://medium.com';
        this.sessionCookies = null;
        this.xsrfToken = null;
        this.userId = null;
        this.cookieFile = path.join(process.cwd(), 'cookies.json');

        this.httpClient = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
            }
        });
    }

    async init() {
        console.log('🎯 初始化精确API测试工具...');

        if (await fs.pathExists(this.cookieFile)) {
            const cookieData = await fs.readJson(this.cookieFile);
            await this.setCookies(cookieData);
            console.log('✅ Cookie已加载');
        } else {
            throw new Error('未找到Cookie文件');
        }

        return true;
    }

    async setCookies(cookieData) {
        let cookieString = '';

        if (cookieData && cookieData.cookies && Array.isArray(cookieData.cookies)) {
            cookieString = cookieData.cookies
                .map(cookie => `${cookie.name}=${cookie.value}`)
                .join('; ');
        }

        this.httpClient.defaults.headers.common['Cookie'] = cookieString;
        this.sessionCookies = cookieString;

        const xsrfMatch = cookieString.match(/xsrf=([^;]+)/);
        if (xsrfMatch) {
            this.xsrfToken = xsrfMatch[1];
            this.httpClient.defaults.headers.common['X-Xsrf-Token'] = this.xsrfToken;
        }

        const uidMatch = cookieString.match(/uid=([^;]+)/);
        if (uidMatch) {
            this.userId = uidMatch[1];
        }
    }

    /**
     * 测试发布相关的API端点
     */
    async testPublishEndpoints() {
        console.log('\n📝 测试发布相关API端点...');
        console.log('=====================================');

        const publishEndpoints = [
            // 最有希望的发布API
            { method: 'POST', url: '/_/api/me/styles/publish', name: '我的样式发布API' },
            { method: 'POST', url: '/_/api/me/styles/set-draft', name: '设置草稿API' },

            // 文章相关API
            { method: 'POST', url: '/_/api/lite/posts', name: '轻量级文章API' },
            { method: 'GET', url: '/_/api/lite/posts', name: '获取轻量级文章' },
            { method: 'POST', url: '/_/api/lite/drafts', name: '轻量级草稿API' },
            { method: 'GET', url: '/_/api/lite/drafts', name: '获取草稿列表' },

            // Tutu API (可能是内部API)
            { method: 'POST', url: '/_/api/tutu/posts', name: 'Tutu文章API' },
            { method: 'GET', url: '/_/api/tutu/posts', name: '获取Tutu文章' },

            // 其他可能相关的API
            { method: 'POST', url: '/_/api/posts/metadata', name: '文章元数据API' },
            { method: 'POST', url: '/_/api/posts/urls', name: '文章URL API' }
        ];

        const results = [];

        for (const endpoint of publishEndpoints) {
            try {
                console.log(`测试: ${endpoint.method} ${endpoint.url}`);

                const config = {
                    method: endpoint.method.toLowerCase(),
                    url: `${this.baseURL}${endpoint.url}`,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Referer': `${this.baseURL}/new-story`,
                        'Origin': this.baseURL
                    },
                    validateStatus: () => true
                };

                // 为POST请求添加测试数据
                if (endpoint.method === 'POST') {
                    if (endpoint.url.includes('publish')) {
                        // 发布相关的数据
                        config.data = {
                            title: 'API测试文章',
                            content: '这是一个API测试文章的内容',
                            tags: ['测试', 'API'],
                            publishStatus: 'public'
                        };
                    } else if (endpoint.url.includes('draft')) {
                        // 草稿相关的数据
                        config.data = {
                            title: 'API测试草稿',
                            content: '这是一个API测试草稿的内容',
                            status: 'draft'
                        };
                    } else if (endpoint.url.includes('posts')) {
                        // 文章相关的数据
                        config.data = {
                            title: 'API测试文章',
                            body: '这是一个API测试文章的正文',
                            tags: ['测试'],
                            license: 'all-rights-reserved'
                        };
                    } else {
                        // 通用测试数据
                        config.data = {
                            test: true,
                            timestamp: Date.now()
                        };
                    }
                }

                const response = await this.httpClient(config);

                const result = {
                    name: endpoint.name,
                    url: endpoint.url,
                    method: endpoint.method,
                    status: response.status,
                    success: response.status >= 200 && response.status < 300,
                    requiresAuth: response.status === 401 || response.status === 403,
                    hasData: !!(response.data && Object.keys(response.data).length > 0),
                    responseSize: JSON.stringify(response.data || {}).length,
                    contentType: response.headers['content-type'] || 'unknown'
                };

                // 记录有用的响应
                if (result.success || result.hasData) {
                    result.sampleResponse = response.data;
                }

                results.push(result);

                // 显示结果
                const icon = result.success ? '✅' :
                    result.requiresAuth ? '🔐' :
                        response.status < 500 ? '⚠️' : '❌';
                console.log(`  ${icon} ${response.status} - ${endpoint.name}`);

                if (result.hasData && result.success) {
                    console.log(`    💾 响应数据大小: ${result.responseSize} 字节`);
                }

                await new Promise(resolve => setTimeout(resolve, 300));

            } catch (error) {
                const result = {
                    name: endpoint.name,
                    url: endpoint.url,
                    method: endpoint.method,
                    status: 'ERROR',
                    error: error.message
                };

                results.push(result);
                console.log(`  ❌ ERROR - ${endpoint.name}: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * 测试修正后的GraphQL查询
     */
    async testCorrectedGraphQL() {
        console.log('\n🎯 测试修正后的GraphQL查询...');
        console.log('=====================================');

        const correctedQueries = [
            // 基于错误信息修正的查询
            {
                name: '查看者信息（修正版）',
                query: `query { viewer { id username name } }`
            },
            {
                name: '单篇文章查询（修正版）',
                query: `query { post(id: "test") { id title isPublished firstPublishedAt } }`
            },
            {
                name: '发布文章（修正版）',
                query: `mutation { publishPost(postId: "test") { id isPublished firstPublishedAt } }`
            },

            // 尝试更多可能的查询
            {
                name: '用户草稿',
                query: `query { viewer { posts(first: 10) { edges { node { id title isPublished } } } } }`
            },
            {
                name: '创建草稿',
                query: `mutation { createPost(input: {}) { id title } }`
            },

            // schema introspection
            {
                name: 'Schema类型查询',
                query: `query { __schema { types { name fields { name type { name } } } } }`
            },
            {
                name: 'Mutation字段查询',
                query: `query { __schema { mutationType { fields { name args { name type { name } } } } } }`
            }
        ];

        const results = [];

        for (const test of correctedQueries) {
            try {
                console.log(`测试: ${test.name}`);

                const response = await this.httpClient.post(`${this.baseURL}/_/graphql`, {
                    query: test.query
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Referer': `${this.baseURL}/new-story`,
                        'Origin': this.baseURL
                    },
                    validateStatus: () => true
                });

                const result = {
                    name: test.name,
                    status: response.status,
                    hasData: !!(response.data && response.data.data),
                    hasErrors: !!(response.data && response.data.errors),
                    errorDetails: response.data && response.data.errors ? response.data.errors : null,
                    dataSize: response.data && response.data.data ?
                        JSON.stringify(response.data.data).length : 0
                };

                // 记录成功的响应
                if (result.hasData) {
                    result.sampleData = response.data.data;
                }

                results.push(result);

                const icon = result.hasData ? '✅' :
                    result.hasErrors ? '⚠️' : '❌';
                console.log(`  ${icon} ${response.status} - ${test.name}`);

                if (result.hasErrors) {
                    console.log(`    ❌ 错误: ${JSON.stringify(result.errorDetails)}`);
                } else if (result.hasData) {
                    console.log(`    💾 数据大小: ${result.dataSize} 字节`);
                }

                await new Promise(resolve => setTimeout(resolve, 400));

            } catch (error) {
                const result = {
                    name: test.name,
                    status: 'ERROR',
                    error: error.message
                };

                results.push(result);
                console.log(`  ❌ ERROR - ${test.name}: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * 生成精确测试报告
     */
    async generatePreciseReport() {
        console.log('\n📊 生成精确测试报告...');
        console.log('=====================================');

        const publishTests = await this.testPublishEndpoints();
        const graphqlTests = await this.testCorrectedGraphQL();

        const report = {
            timestamp: new Date().toISOString(),
            userId: this.userId,
            hasValidAuth: !!this.xsrfToken,
            publishTests,
            graphqlTests,
            summary: {
                successfulEndpoints: publishTests.filter(t => t.success).length,
                workingGraphQLQueries: graphqlTests.filter(t => t.hasData).length,
                totalEndpointsTested: publishTests.length,
                totalGraphQLTested: graphqlTests.length,
                recommendations: []
            }
        };

        // 生成建议
        const successfulEndpoints = publishTests.filter(t => t.success);
        if (successfulEndpoints.length > 0) {
            report.summary.recommendations.push(
                `发现 ${successfulEndpoints.length} 个可用的发布端点: ${successfulEndpoints.map(e => e.name).join(', ')}`
            );
        }

        const workingGraphQL = graphqlTests.filter(t => t.hasData);
        if (workingGraphQL.length > 0) {
            report.summary.recommendations.push(
                `发现 ${workingGraphQL.length} 个有效的GraphQL查询，可以基于此构建发布功能`
            );
        }

        // 保存报告
        const reportFile = path.join(process.cwd(), `precise-test-report-${Date.now()}.json`);
        await fs.writeJson(reportFile, report, { spaces: 2 });

        console.log(`✅ 精确测试报告已保存: ${reportFile}`);

        // 显示摘要
        console.log('\n📋 精确测试摘要:');
        console.log(`✅ 成功的端点: ${report.summary.successfulEndpoints} 个`);
        console.log(`🎯 有效的GraphQL查询: ${report.summary.workingGraphQLQueries} 个`);
        console.log(`📝 测试的端点总数: ${report.summary.totalEndpointsTested} 个`);
        console.log(`⚡ 测试的GraphQL总数: ${report.summary.totalGraphQLTested} 个`);

        return report;
    }
}

// 主执行函数
async function main() {
    try {
        const tester = new PreciseAPITest();
        await tester.init();

        console.log('🚀 开始精确API测试...');
        console.log('=====================================');

        const report = await tester.generatePreciseReport();

        console.log('\n🎉 精确测试完成！');
        console.log('\n💡 核心建议:');
        report.summary.recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. ${rec}`);
        });

        if (report.summary.successfulEndpoints > 0 || report.summary.workingGraphQLQueries > 0) {
            console.log('\n🚀 下一步: 基于成功的端点和查询构建真正的发布功能！');
        }

    } catch (error) {
        console.error('❌ 精确测试失败:', error.message);
        process.exit(1);
    }
}

// 错误处理
process.on('unhandledRejection', (error) => {
    console.error('❌ 未处理的Promise错误:', error.message);
    process.exit(1);
});

// 执行
if (require.main === module) {
    main();
}

module.exports = { PreciseAPITest }; 