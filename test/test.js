const { logger } = require('../lib/utils');
const MediumPublisher = require('../lib/medium-publisher');
const MediumAutoPost = require('../index');

/**
 * 系统测试套件
 * 用于验证所有组件的功能正常
 */
class SystemTester {
    constructor() {
        this.app = new MediumAutoPost();
        this.testResults = [];
    }

    /**
     * 运行所有测试
     */
    async runAllTests() {
        console.log('\n=== Medium自动发布系统测试 ===\n');

        const tests = [
            { name: '环境配置检查', fn: this.testEnvironment },
            { name: '文章管理器测试', fn: this.testArticleManager },
            { name: 'Medium连接测试', fn: this.testMediumConnection },
            { name: 'API端点测试', fn: this.testApiEndpoints },
            { name: '文章创建测试', fn: this.testArticleCreation },
            { name: '工具函数测试', fn: this.testUtilityFunctions }
        ];

        for (const test of tests) {
            try {
                console.log(`正在执行: ${test.name}...`);
                const result = await test.fn.call(this);
                this.testResults.push({
                    name: test.name,
                    status: 'PASS',
                    result: result
                });
                console.log(`✅ ${test.name} - 通过\n`);
            } catch (error) {
                this.testResults.push({
                    name: test.name,
                    status: 'FAIL',
                    error: error.message
                });
                console.log(`❌ ${test.name} - 失败: ${error.message}\n`);
            }
        }

        this.printTestSummary();
    }

    /**
     * 测试环境配置
     */
    async testEnvironment() {
        const requiredVars = ['MEDIUM_EMAIL', 'MEDIUM_PASSWORD'];
        const missing = requiredVars.filter(key => !process.env[key]);

        if (missing.length > 0) {
            throw new Error(`缺少环境变量: ${missing.join(', ')}`);
        }

        // 检查可选配置
        const optionalVars = ['API_SECRET_KEY', 'PUPPETEER_HEADLESS', 'DEBUG_MODE'];
        const configured = optionalVars.filter(key => process.env[key]);

        return {
            required: requiredVars.length,
            optional: configured.length,
            missing: missing
        };
    }

    /**
     * 测试文章管理器
     */
    async testArticleManager() {
        await this.app.init();

        // 测试创建示例文章
        const article = await this.app.createSampleArticle();

        if (!article.title || !article.content) {
            throw new Error('示例文章创建失败');
        }

        return {
            articleCreated: true,
            title: article.title,
            hasContent: !!article.content,
            hasTags: Array.isArray(article.tags)
        };
    }

    /**
     * 测试Medium连接（仅连接测试，不实际登录）
     */
    async testMediumConnection() {
        // 仅测试Puppeteer初始化，不进行实际登录
        const publisher = new MediumPublisher();

        try {
            await publisher.init();
            await publisher.close();

            return {
                puppeteerInit: true,
                browserSupported: true
            };
        } catch (error) {
            throw new Error(`Puppeteer初始化失败: ${error.message}`);
        }
    }

    /**
     * 测试API端点结构
     */
    async testApiEndpoints() {
        const fs = require('fs-extra');
        const path = require('path');

        const apiDir = path.join(process.cwd(), 'api');
        const expectedFiles = ['cron-publish.js', 'publish.js', 'articles.js'];

        const results = {};

        for (const file of expectedFiles) {
            const filePath = path.join(apiDir, file);
            const exists = await fs.pathExists(filePath);
            results[file] = exists;

            if (!exists) {
                throw new Error(`API文件缺失: ${file}`);
            }
        }

        return results;
    }

    /**
     * 测试文章创建功能
     */
    async testArticleCreation() {
        const { ValidationUtils } = require('../lib/utils');

        // 测试有效文章
        const validArticle = {
            title: '测试文章',
            content: '这是测试内容',
            tags: ['测试']
        };

        const validation = ValidationUtils.validateArticle(validArticle);
        if (!validation.isValid) {
            throw new Error('有效文章验证失败');
        }

        // 测试无效文章
        const invalidArticle = {
            title: '',
            content: '',
            tags: []
        };

        const invalidValidation = ValidationUtils.validateArticle(invalidArticle);
        if (invalidValidation.isValid) {
            throw new Error('无效文章未被正确识别');
        }

        return {
            validArticlePass: validation.isValid,
            invalidArticleFail: !invalidValidation.isValid,
            validationErrorCount: invalidValidation.errors.length
        };
    }

    /**
     * 测试工具函数
     */
    async testUtilityFunctions() {
        const { TimeUtils, ResponseUtils } = require('../lib/utils');

        // 测试时间工具
        const futureTime = new Date(Date.now() + 60000).toISOString();
        const pastTime = new Date(Date.now() - 60000).toISOString();

        const shouldPublishFuture = TimeUtils.isTimeToPublish(futureTime);
        const shouldPublishPast = TimeUtils.isTimeToPublish(pastTime);

        if (shouldPublishFuture || !shouldPublishPast) {
            throw new Error('时间判断逻辑错误');
        }

        // 测试响应工具
        const successResponse = ResponseUtils.success({ test: 'data' }, '测试成功');
        const errorResponse = ResponseUtils.error('测试错误');

        if (!successResponse.success || errorResponse.success) {
            throw new Error('响应工具功能异常');
        }

        return {
            timeUtilsWorking: true,
            responseUtilsWorking: true,
            timeFormatting: !!TimeUtils.formatPublishTime(new Date())
        };
    }

    /**
     * 打印测试结果摘要
     */
    printTestSummary() {
        console.log('\n=== 测试结果摘要 ===');

        const passCount = this.testResults.filter(r => r.status === 'PASS').length;
        const failCount = this.testResults.filter(r => r.status === 'FAIL').length;

        console.log(`总测试数: ${this.testResults.length}`);
        console.log(`通过: ${passCount}`);
        console.log(`失败: ${failCount}`);
        console.log(`成功率: ${((passCount / this.testResults.length) * 100).toFixed(1)}%`);

        if (failCount > 0) {
            console.log('\n失败的测试:');
            this.testResults
                .filter(r => r.status === 'FAIL')
                .forEach(r => {
                    console.log(`❌ ${r.name}: ${r.error}`);
                });
        }

        console.log('\n========================\n');

        // 返回退出码
        process.exit(failCount > 0 ? 1 : 0);
    }
}

/**
 * 性能测试
 */
class PerformanceTester {
    static async testSystemPerformance() {
        console.log('=== 性能测试 ===\n');

        const startTime = Date.now();

        // 测试文章管理器初始化时间
        const { articleManager } = require('../lib/utils');
        const initStart = Date.now();
        await articleManager.init();
        const initTime = Date.now() - initStart;

        // 测试文章创建时间
        const createStart = Date.now();
        await articleManager.createSampleArticle();
        const createTime = Date.now() - createStart;

        const totalTime = Date.now() - startTime;

        console.log(`初始化时间: ${initTime}ms`);
        console.log(`文章创建时间: ${createTime}ms`);
        console.log(`总执行时间: ${totalTime}ms`);

        if (totalTime > 5000) {
            console.log('⚠️  性能警告: 系统响应时间较慢');
        } else {
            console.log('✅ 性能测试通过');
        }

        console.log('\n==================\n');
    }
}

// 主测试函数
async function main() {
    try {
        const args = process.argv.slice(2);
        const testType = args[0] || 'all';

        switch (testType) {
            case 'performance':
                await PerformanceTester.testSystemPerformance();
                break;

            case 'quick':
                const tester = new SystemTester();
                await tester.testEnvironment();
                await tester.testArticleManager();
                console.log('✅ 快速测试完成');
                break;

            case 'all':
            default:
                const fullTester = new SystemTester();
                await fullTester.runAllTests();
                break;
        }

    } catch (error) {
        console.error('测试执行失败:', error);
        process.exit(1);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    main();
}

module.exports = { SystemTester, PerformanceTester }; 