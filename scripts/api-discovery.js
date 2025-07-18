/**
 * Medium API端点发现工具
 * 通过多种方法分析和发现Medium的真实API端点
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../lib/utils');

class MediumAPIDiscovery {
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
        console.log('🔍 初始化API发现工具...');

        // 加载Cookie
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

        // 提取XSRF Token
        const xsrfMatch = cookieString.match(/xsrf=([^;]+)/);
        if (xsrfMatch) {
            this.xsrfToken = xsrfMatch[1];
            this.httpClient.defaults.headers.common['X-Xsrf-Token'] = this.xsrfToken;
        }

        // 提取用户ID
        const uidMatch = cookieString.match(/uid=([^;]+)/);
        if (uidMatch) {
            this.userId = uidMatch[1];
        }
    }

    /**
     * 分析Medium写作页面，提取API调用信息
     */
    async analyzeEditorPage() {
        console.log('\n📝 分析Medium编辑器页面...');
        console.log('=====================================');

        try {
            const response = await this.httpClient.get(`${this.baseURL}/new-story`, {
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });

            const html = response.data;
            const discoveredAPIs = [];

            // 1. 查找JavaScript中的API端点
            const apiPatterns = [
                /\/\_\/api\/[^"'\s]+/g,
                /\/\_\/graphql[^"'\s]*/g,
                /\/api\/v\d+\/[^"'\s]+/g,
                /\/p\/[^"'\s]+/g,
                /\/_\/[^"'\s]+/g
            ];

            for (const pattern of apiPatterns) {
                const matches = html.match(pattern);
                if (matches) {
                    discoveredAPIs.push(...matches);
                }
            }

            // 2. 查找GraphQL查询
            const graphqlQueries = [];
            const queryPattern = /query\s+(\w+)\s*\{[^}]+\}/g;
            let match;
            while ((match = queryPattern.exec(html)) !== null) {
                graphqlQueries.push(match[1]);
            }

            // 3. 查找mutation操作
            const mutations = [];
            const mutationPattern = /mutation\s+(\w+)\s*\{[^}]+\}/g;
            while ((match = mutationPattern.exec(html)) !== null) {
                mutations.push(match[1]);
            }

            console.log(`🎯 发现API端点: ${[...new Set(discoveredAPIs)].length} 个`);
            console.log(`🎯 发现GraphQL查询: ${[...new Set(graphqlQueries)].length} 个`);
            console.log(`🎯 发现Mutation操作: ${[...new Set(mutations)].length} 个`);

            return {
                apis: [...new Set(discoveredAPIs)],
                queries: [...new Set(graphqlQueries)],
                mutations: [...new Set(mutations)]
            };

        } catch (error) {
            console.error('❌ 编辑器页面分析失败:', error.message);
            return { apis: [], queries: [], mutations: [] };
        }
    }

    /**
     * 测试常见的API端点
     */
    async testCommonEndpoints() {
        console.log('\n🧪 测试常见API端点...');
        console.log('=====================================');

        const endpoints = [
            // 用户相关
            { method: 'GET', url: '/_/api/users/self', name: '用户信息' },
            { method: 'GET', url: '/_/api/me', name: '我的信息' },

            // 文章相关
            { method: 'GET', url: '/_/api/posts', name: '文章列表' },
            { method: 'POST', url: '/_/api/posts', name: '创建文章' },
            { method: 'GET', url: '/_/api/stories', name: 'Story列表' },
            { method: 'POST', url: '/_/api/stories', name: '创建Story' },

            // 发布相关
            { method: 'POST', url: '/p/submit', name: '提交发布' },
            { method: 'POST', url: '/_/api/publish', name: '发布API' },
            { method: 'POST', url: '/_/api/editor/save', name: '编辑器保存' },

            // GraphQL
            { method: 'POST', url: '/_/graphql', name: 'GraphQL接口' }
        ];

        const results = [];

        for (const endpoint of endpoints) {
            try {
                console.log(`测试: ${endpoint.method} ${endpoint.url}`);

                const config = {
                    method: endpoint.method.toLowerCase(),
                    url: `${this.baseURL}${endpoint.url}`,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    validateStatus: () => true // 接受所有状态码
                };

                if (endpoint.method === 'POST') {
                    config.data = { test: true };
                }

                const response = await this.httpClient(config);

                const result = {
                    name: endpoint.name,
                    url: endpoint.url,
                    method: endpoint.method,
                    status: response.status,
                    accessible: response.status < 500,
                    requiresAuth: response.status === 401 || response.status === 403,
                    contentType: response.headers['content-type'] || 'unknown'
                };

                results.push(result);

                // 显示结果
                const status = response.status;
                const icon = status < 400 ? '✅' : status < 500 ? '⚠️' : '❌';
                console.log(`  ${icon} ${status} - ${endpoint.name}`);

                // 添加延迟避免过快请求
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                const result = {
                    name: endpoint.name,
                    url: endpoint.url,
                    method: endpoint.method,
                    status: 'ERROR',
                    accessible: false,
                    error: error.message
                };

                results.push(result);
                console.log(`  ❌ ERROR - ${endpoint.name}: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * 分析网络请求模式
     */
    async analyzeRequestPatterns() {
        console.log('\n🔍 分析请求模式...');
        console.log('=====================================');

        // 访问几个关键页面，分析请求模式
        const pages = [
            { url: '/new-story', name: '新建文章页面' },
            { url: '/me/stories/drafts', name: '草稿页面' },
            { url: '/me/stories/public', name: '已发布页面' }
        ];

        const patterns = [];

        for (const page of pages) {
            try {
                console.log(`分析页面: ${page.name}`);

                const response = await this.httpClient.get(`${this.baseURL}${page.url}`, {
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });

                const html = response.data;

                // 查找特定的模式
                const foundPatterns = {
                    page: page.name,
                    hasApollo: html.includes('__APOLLO_STATE__'),
                    hasGraphQL: html.includes('graphql'),
                    hasAPI: html.includes('/_/api/'),
                    hasXSRF: html.includes('xsrf') || html.includes('csrf'),
                    hasFormSubmit: html.includes('form') && html.includes('submit')
                };

                patterns.push(foundPatterns);

                // 提取Apollo状态中的信息
                if (foundPatterns.hasApollo) {
                    const apolloMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*({.*?});/s);
                    if (apolloMatch) {
                        try {
                            const apolloState = JSON.parse(apolloMatch[1]);
                            console.log(`  🎯 Apollo状态包含 ${Object.keys(apolloState).length} 个条目`);
                        } catch (e) {
                            console.log('  ⚠️ Apollo状态解析失败');
                        }
                    }
                }

                console.log(`  ✅ ${page.name} 分析完成`);

            } catch (error) {
                console.log(`  ❌ ${page.name} 分析失败: ${error.message}`);
            }
        }

        return patterns;
    }

    /**
     * 生成详细报告
     */
    async generateReport() {
        console.log('\n📊 生成API发现报告...');
        console.log('=====================================');

        const editorAnalysis = await this.analyzeEditorPage();
        const endpointTests = await this.testCommonEndpoints();
        const requestPatterns = await this.analyzeRequestPatterns();

        const report = {
            timestamp: new Date().toISOString(),
            userId: this.userId,
            hasValidAuth: !!this.xsrfToken,
            editorAnalysis,
            endpointTests,
            requestPatterns,
            summary: {
                totalAPIsFound: editorAnalysis.apis.length,
                accessibleEndpoints: endpointTests.filter(e => e.accessible).length,
                requiresAuthEndpoints: endpointTests.filter(e => e.requiresAuth).length,
                recommendations: []
            }
        };

        // 生成建议
        const accessible = endpointTests.filter(e => e.accessible);
        if (accessible.length > 0) {
            report.summary.recommendations.push(`发现 ${accessible.length} 个可访问的端点，建议进一步测试`);
        }

        if (editorAnalysis.mutations.length > 0) {
            report.summary.recommendations.push(`发现 ${editorAnalysis.mutations.length} 个GraphQL mutations，可能包含发布操作`);
        }

        // 保存报告
        const reportFile = path.join(process.cwd(), `api-discovery-report-${Date.now()}.json`);
        await fs.writeJson(reportFile, report, { spaces: 2 });

        console.log(`✅ 报告已保存: ${reportFile}`);

        // 显示摘要
        console.log('\n📋 发现摘要:');
        console.log(`🎯 API端点: ${report.summary.totalAPIsFound} 个`);
        console.log(`✅ 可访问端点: ${report.summary.accessibleEndpoints} 个`);
        console.log(`🔐 需要认证端点: ${report.summary.requiresAuthEndpoints} 个`);
        console.log(`🔍 GraphQL查询: ${editorAnalysis.queries.length} 个`);
        console.log(`⚡ GraphQL变更: ${editorAnalysis.mutations.length} 个`);

        return report;
    }
}

// 主执行函数
async function main() {
    try {
        const discovery = new MediumAPIDiscovery();
        await discovery.init();

        console.log('🚀 开始API端点发现...');
        console.log('=====================================');

        const report = await discovery.generateReport();

        console.log('\n🎉 API发现完成！');
        console.log('\n💡 下一步建议:');
        console.log('1. 查看生成的JSON报告文件');
        console.log('2. 测试发现的可访问端点');
        console.log('3. 分析GraphQL mutations');
        console.log('4. 使用发现的信息更新发布器');

    } catch (error) {
        console.error('❌ API发现失败:', error.message);
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

module.exports = { MediumAPIDiscovery }; 