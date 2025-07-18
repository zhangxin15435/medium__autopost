/**
 * 深度API分析工具
 * 分析Medium的JavaScript代码，发现真实的API调用和GraphQL查询
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../lib/utils');

class DeepAPIAnalysis {
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
        console.log('🔍 初始化深度API分析工具...');

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
     * 分析JavaScript Bundle文件，提取API调用
     */
    async analyzeJavaScriptBundles() {
        console.log('\n📦 分析JavaScript Bundle文件...');
        console.log('=====================================');

        // 获取编辑器页面，提取JavaScript文件URL
        const response = await this.httpClient.get(`${this.baseURL}/new-story`, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        const html = response.data;

        // 提取JavaScript文件URL
        const jsUrls = [];
        const jsPattern = /src="([^"]*\.js[^"]*)"/g;
        let match;
        while ((match = jsPattern.exec(html)) !== null) {
            if (match[1].includes('bundle') || match[1].includes('main')) {
                jsUrls.push(match[1]);
            }
        }

        console.log(`🎯 发现 ${jsUrls.length} 个关键JavaScript文件`);

        const findings = {
            apiEndpoints: new Set(),
            graphqlQueries: new Set(),
            graphqlMutations: new Set(),
            httpMethods: new Set()
        };

        // 分析每个JavaScript文件
        for (let i = 0; i < Math.min(jsUrls.length, 5); i++) { // 限制分析文件数量
            const jsUrl = jsUrls[i];
            try {
                console.log(`分析文件 ${i + 1}/${Math.min(jsUrls.length, 5)}: ${path.basename(jsUrl)}`);

                const fullUrl = jsUrl.startsWith('http') ? jsUrl : `${this.baseURL}${jsUrl}`;
                const jsResponse = await this.httpClient.get(fullUrl);
                const jsCode = jsResponse.data;

                // 查找API端点
                this.extractAPIEndpoints(jsCode, findings);

                // 查找GraphQL查询
                this.extractGraphQLQueries(jsCode, findings);

                // 查找HTTP方法
                this.extractHTTPMethods(jsCode, findings);

                await new Promise(resolve => setTimeout(resolve, 500)); // 避免请求过快

            } catch (error) {
                console.log(`  ⚠️ 文件分析失败: ${error.message}`);
            }
        }

        return {
            apiEndpoints: Array.from(findings.apiEndpoints),
            graphqlQueries: Array.from(findings.graphqlQueries),
            graphqlMutations: Array.from(findings.graphqlMutations),
            httpMethods: Array.from(findings.httpMethods)
        };
    }

    /**
     * 从JavaScript代码中提取API端点
     */
    extractAPIEndpoints(code, findings) {
        const patterns = [
            // API路径模式
            /["'](\/[_a-zA-Z0-9\/\-\.]+api[_a-zA-Z0-9\/\-\.]*\/[_a-zA-Z0-9\/\-\.]+)["']/g,
            /["'](\/[_a-zA-Z0-9\/\-\.]*\/_\/[_a-zA-Z0-9\/\-\.]+)["']/g,
            /["'](\/[_a-zA-Z0-9\/\-\.]*\/graphql[_a-zA-Z0-9\/\-\.]*)["']/g,
            // 动态API构建
            /apiUrl\s*[+:=]\s*["']([^"']+)["']/g,
            /endpoint\s*[+:=]\s*["']([^"']+)["']/g,
            /url\s*[+:=]\s*["']([^"']+)["']/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                const endpoint = match[1];
                if (endpoint && endpoint.includes('/') && !endpoint.includes('.css') && !endpoint.includes('.js')) {
                    findings.apiEndpoints.add(endpoint);
                }
            }
        }
    }

    /**
     * 从JavaScript代码中提取GraphQL查询
     */
    extractGraphQLQueries(code, findings) {
        // GraphQL查询模式
        const queryPatterns = [
            /query\s+(\w+)\s*{[^}]*}/g,
            /mutation\s+(\w+)\s*{[^}]*}/g,
            /gql`\s*(query[^`]+)`/g,
            /gql`\s*(mutation[^`]+)`/g,
            /["']query\s+(\w+)\s*{[^"']*}["']/g,
            /["']mutation\s+(\w+)\s*{[^"']*}["']/g
        ];

        for (const pattern of queryPatterns) {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                const queryName = match[1];
                if (queryName) {
                    if (match[0].toLowerCase().includes('mutation')) {
                        findings.graphqlMutations.add(queryName);
                    } else {
                        findings.graphqlQueries.add(queryName);
                    }
                }
            }
        }
    }

    /**
     * 从JavaScript代码中提取HTTP方法
     */
    extractHTTPMethods(code, findings) {
        const methodPatterns = [
            /\.post\s*\(/g,
            /\.get\s*\(/g,
            /\.put\s*\(/g,
            /\.delete\s*\(/g,
            /\.patch\s*\(/g,
            /method:\s*["'](\w+)["']/g,
            /type:\s*["'](\w+)["']/g
        ];

        for (const pattern of methodPatterns) {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                if (match[1]) {
                    findings.httpMethods.add(match[1].toUpperCase());
                } else {
                    const method = match[0].replace(/[\.()]/g, '').toUpperCase();
                    if (['POST', 'GET', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
                        findings.httpMethods.add(method);
                    }
                }
            }
        }
    }

    /**
     * 测试GraphQL接口，尝试不同的查询格式
     */
    async testGraphQLInterface() {
        console.log('\n🎯 测试GraphQL接口...');
        console.log('=====================================');

        const testQueries = [
            // 基础查询
            {
                name: '用户信息查询',
                query: `query { viewer { id username name } }`
            },
            {
                name: '文章列表查询',
                query: `query { posts { id title createdAt } }`
            },
            {
                name: '当前用户查询',
                query: `query { me { id name username email } }`
            },
            // 可能的发布相关mutation
            {
                name: '创建文章',
                query: `mutation { createPost(input: { title: "Test", content: "Test content" }) { id url } }`
            },
            {
                name: '发布文章',
                query: `mutation { publishPost(id: "test") { id publishedAt } }`
            }
        ];

        const results = [];

        for (const test of testQueries) {
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
                    errorDetails: response.data && response.data.errors ? response.data.errors : null
                };

                results.push(result);

                const icon = response.status === 200 ? '✅' : response.status < 500 ? '⚠️' : '❌';
                console.log(`  ${icon} ${response.status} - ${test.name}`);

                if (result.hasErrors) {
                    console.log(`    错误: ${JSON.stringify(result.errorDetails)}`);
                }

                await new Promise(resolve => setTimeout(resolve, 300));

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
     * 分析实际的发布操作流程
     */
    async analyzePublishWorkflow() {
        console.log('\n📝 分析发布工作流程...');
        console.log('=====================================');

        const workflow = {
            steps: [],
            apiCalls: [],
            formData: null
        };

        try {
            // 1. 访问新建文章页面
            console.log('步骤1: 访问新建文章页面');
            const newStoryResponse = await this.httpClient.get(`${this.baseURL}/new-story`);

            // 分析页面中的表单和API调用
            const html = newStoryResponse.data;

            // 查找表单提交目标
            const formPattern = /<form[^>]*action=["']([^"']+)["'][^>]*>/g;
            let formMatch;
            while ((formMatch = formPattern.exec(html)) !== null) {
                workflow.steps.push({
                    step: 'form_submit',
                    action: formMatch[1],
                    method: 'POST'
                });
            }

            // 查找AJAX调用模式
            const ajaxPatterns = [
                /ajax\s*\(\s*{[^}]*url\s*:\s*["']([^"']+)["']/g,
                /fetch\s*\(\s*["']([^"']+)["']/g,
                /axios\.[a-z]+\s*\(\s*["']([^"']+)["']/g
            ];

            for (const pattern of ajaxPatterns) {
                let match;
                while ((match = pattern.exec(html)) !== null) {
                    workflow.apiCalls.push({
                        type: 'ajax',
                        url: match[1]
                    });
                }
            }

            console.log(`  ✅ 发现 ${workflow.steps.length} 个表单操作`);
            console.log(`  ✅ 发现 ${workflow.apiCalls.length} 个AJAX调用`);

        } catch (error) {
            console.log(`  ❌ 工作流程分析失败: ${error.message}`);
        }

        return workflow;
    }

    /**
     * 生成深度分析报告
     */
    async generateDeepReport() {
        console.log('\n📊 生成深度分析报告...');
        console.log('=====================================');

        const jsAnalysis = await this.analyzeJavaScriptBundles();
        const graphqlTests = await this.testGraphQLInterface();
        const workflowAnalysis = await this.analyzePublishWorkflow();

        const report = {
            timestamp: new Date().toISOString(),
            userId: this.userId,
            jsAnalysis,
            graphqlTests,
            workflowAnalysis,
            recommendations: []
        };

        // 生成建议
        if (jsAnalysis.apiEndpoints.length > 0) {
            report.recommendations.push(`发现 ${jsAnalysis.apiEndpoints.length} 个潜在API端点，建议逐个测试`);
        }

        if (jsAnalysis.graphqlMutations.length > 0) {
            report.recommendations.push(`发现 ${jsAnalysis.graphqlMutations.length} 个GraphQL mutations，可能包含发布功能`);
        }

        const successfulGraphQL = graphqlTests.filter(t => t.hasData);
        if (successfulGraphQL.length > 0) {
            report.recommendations.push(`${successfulGraphQL.length} 个GraphQL查询成功，说明接口可用`);
        }

        // 保存报告
        const reportFile = path.join(process.cwd(), `deep-analysis-report-${Date.now()}.json`);
        await fs.writeJson(reportFile, report, { spaces: 2 });

        console.log(`✅ 深度分析报告已保存: ${reportFile}`);

        // 显示摘要
        console.log('\n📋 深度分析摘要:');
        console.log(`🎯 发现API端点: ${jsAnalysis.apiEndpoints.length} 个`);
        console.log(`🔍 GraphQL查询: ${jsAnalysis.graphqlQueries.length} 个`);
        console.log(`⚡ GraphQL变更: ${jsAnalysis.graphqlMutations.length} 个`);
        console.log(`✅ 成功的GraphQL测试: ${graphqlTests.filter(t => t.hasData).length} 个`);
        console.log(`📝 工作流程步骤: ${workflowAnalysis.steps.length} 个`);

        return report;
    }
}

// 主执行函数
async function main() {
    try {
        const analysis = new DeepAPIAnalysis();
        await analysis.init();

        console.log('🚀 开始深度API分析...');
        console.log('=====================================');

        const report = await analysis.generateDeepReport();

        console.log('\n🎉 深度分析完成！');
        console.log('\n💡 建议的下一步操作:');
        report.recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. ${rec}`);
        });

    } catch (error) {
        console.error('❌ 深度分析失败:', error.message);
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

module.exports = { DeepAPIAnalysis }; 