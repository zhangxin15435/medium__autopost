#!/usr/bin/env node

/**
 * Medium自动发布系统设置脚本
 * 帮助用户快速配置和初始化项目
 */

const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');

class ProjectSetup {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    /**
     * 询问用户输入
     */
    async prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }

    /**
     * 主设置流程
     */
    async setup() {
        console.log('\n🚀 Medium自动发布系统设置向导\n');
        console.log('我们将帮助您配置项目的基本设置...\n');

        try {
            // 检查.env文件是否存在
            const envPath = path.join(process.cwd(), '.env');
            const envExists = await fs.pathExists(envPath);

            if (envExists) {
                const overwrite = await this.prompt('检测到已有.env文件，是否覆盖？(y/N): ');
                if (overwrite.toLowerCase() !== 'y') {
                    console.log('设置已取消');
                    this.rl.close();
                    return;
                }
            }

            // 收集用户配置
            const config = await this.collectConfig();

            // 生成.env文件
            await this.generateEnvFile(config);

            // 创建示例文章
            const createSample = await this.prompt('是否创建示例文章？(Y/n): ');
            if (createSample.toLowerCase() !== 'n') {
                await this.createSampleArticle();
            }

            console.log('\n✅ 项目设置完成！');
            console.log('\n下一步：');
            console.log('1. npm install           # 安装依赖');
            console.log('2. node index.js test    # 测试连接');
            console.log('3. node index.js sample  # 创建示例文章');
            console.log('4. vercel --prod         # 部署到Vercel\n');

        } catch (error) {
            console.error('设置过程中发生错误:', error.message);
        } finally {
            this.rl.close();
        }
    }

    /**
     * 收集用户配置
     */
    async collectConfig() {
        console.log('📝 请提供以下配置信息：\n');

        const config = {};

        // Medium账户配置
        config.email = await this.prompt('Medium邮箱地址: ');
        config.password = await this.prompt('Medium密码: ');

        // API密钥
        const useRandomKey = await this.prompt('使用随机生成的API密钥？(Y/n): ');
        if (useRandomKey.toLowerCase() !== 'n') {
            config.apiKey = this.generateRandomKey();
            console.log(`生成的API密钥: ${config.apiKey}`);
        } else {
            config.apiKey = await this.prompt('自定义API密钥: ');
        }

        // 可选配置
        config.publication = await this.prompt('Medium专栏名称（可选）: ');
        config.defaultTags = await this.prompt('默认标签（逗号分隔，可选）: ') || '技术,编程,自动化';

        // 高级配置
        const advancedConfig = await this.prompt('配置高级选项？(y/N): ');
        if (advancedConfig.toLowerCase() === 'y') {
            config.headless = await this.prompt('Puppeteer无头模式 (true/false): ') || 'true';
            config.slowMo = await this.prompt('Puppeteer操作延迟毫秒数: ') || '100';
            config.debugMode = await this.prompt('启用调试模式 (true/false): ') || 'false';
            config.logLevel = await this.prompt('日志级别 (info/debug/warn/error): ') || 'info';
        } else {
            config.headless = 'true';
            config.slowMo = '100';
            config.debugMode = 'false';
            config.logLevel = 'info';
        }

        return config;
    }

    /**
     * 生成.env文件
     */
    async generateEnvFile(config) {
        const envContent = `# Medium账户配置
MEDIUM_EMAIL=${config.email}
MEDIUM_PASSWORD=${config.password}

# 文章发布配置
MEDIUM_PUBLICATION=${config.publication || ''}
DEFAULT_TAGS=${config.defaultTags}

# 安全配置
API_SECRET_KEY=${config.apiKey}

# Puppeteer配置
PUPPETEER_HEADLESS=${config.headless}
PUPPETEER_SLOW_MO=${config.slowMo}

# 调试配置
DEBUG_MODE=${config.debugMode}
LOG_LEVEL=${config.logLevel}

# Vercel配置（部署后自动设置）
VERCEL_URL=
`;

        const envPath = path.join(process.cwd(), '.env');
        await fs.writeFile(envPath, envContent, 'utf8');
        console.log('\n✅ .env文件已创建');
    }

    /**
     * 创建示例文章
     */
    async createSampleArticle() {
        try {
            const articlesDir = path.join(process.cwd(), 'articles', 'drafts');
            await fs.ensureDir(articlesDir);

            const sampleArticle = {
                title: "我的第一篇自动发布文章",
                subtitle: "Medium自动发布系统测试",
                content: `
欢迎使用Medium自动发布系统！

这是一篇示例文章，用于测试系统功能。

## 主要功能

✅ **定时发布** - 设定时间自动发布
✅ **即时发布** - 通过API立即发布
✅ **文章管理** - 完整的CRUD操作
✅ **标签支持** - 自动添加文章标签

## 使用方法

1. 配置Medium账户信息
2. 创建或导入文章
3. 设置发布时间
4. 等待自动发布或手动触发

感谢使用本系统！
        `.trim(),
                tags: ["自动化", "Medium", "测试"],
                scheduledTime: new Date(Date.now() + 60000).toISOString(), // 1分钟后
                status: "pending",
                createdAt: new Date().toISOString(),
                source: "setup-wizard"
            };

            const fileName = `setup-sample-${Date.now()}.json`;
            const filePath = path.join(articlesDir, fileName);

            await fs.writeJson(filePath, sampleArticle, { spaces: 2 });
            console.log(`✅ 示例文章已创建: ${fileName}`);

        } catch (error) {
            console.error('创建示例文章失败:', error.message);
        }
    }

    /**
     * 生成随机API密钥
     */
    generateRandomKey(length = 32) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}

// 主函数
async function main() {
    const setup = new ProjectSetup();
    await setup.setup();
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(error => {
        console.error('设置脚本执行失败:', error);
        process.exit(1);
    });
}

module.exports = ProjectSetup; 