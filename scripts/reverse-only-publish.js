/**
 * 无官方Token的逆向分析发布器
 * 专门为没有Medium Integration Token的用户提供纯逆向分析解决方案
 */

const path = require('path');
const fs = require('fs-extra');

// 引入依赖
const MediumReversePublisher = require('../lib/medium-api-reverse');
const { logger } = require('../lib/utils');

class PureReversePublisher {
    constructor() {
        this.cookieFile = path.join(process.cwd(), 'cookies.json');
        this.reversePublisher = null;
    }

    /**
     * 初始化纯逆向分析发布器
     */
    async init() {
        try {
            console.log('🔍 初始化纯逆向分析发布器...');
            console.log('=====================================');

            // 检查Cookie文件
            if (!await fs.pathExists(this.cookieFile)) {
                throw new Error(`
❌ 未找到Cookie文件: ${this.cookieFile}

📋 获取Cookie的步骤:
1. 打开浏览器，登录Medium.com
2. 按F12开启开发者工具
3. 转到Application → Storage → Cookies
4. 复制所有Cookie并保存到cookies.json

🔧 或使用浏览器插件自动导出Cookie
                `);
            }

            // 初始化逆向发布器（不使用Integration Token）
            this.reversePublisher = new MediumReversePublisher({
                integrationToken: null // 强制使用Cookie认证
            });

            // 初始化认证
            await this.reversePublisher.init();

            console.log('✅ 纯逆向分析发布器初始化成功');
            console.log(`✅ 认证方式: Cookie认证`);
            console.log(`✅ 用户ID: ${this.reversePublisher.userId || '已获取'}`);
            console.log(`✅ XSRF Token: ${this.reversePublisher.xsrfToken ? '已设置' : '使用默认值'}`);

            return true;

        } catch (error) {
            console.error('❌ 初始化失败:', error.message);
            throw error;
        }
    }

    /**
     * 发布单篇文章
     */
    async publishSingleArticle(article) {
        try {
            console.log(`\n📝 开始发布文章: ${article.title}`);
            console.log('=====================================');

            const result = await this.reversePublisher.publishArticle(article);

            console.log('✅ 文章发布成功!');
            console.log(`📄 标题: ${result.title}`);
            console.log(`🔗 链接: ${result.url || result.mediumUrl}`);
            console.log(`📅 发布时间: ${result.publishedAt || new Date().toISOString()}`);

            return result;

        } catch (error) {
            console.error('❌ 文章发布失败:', error.message);
            throw error;
        }
    }

    /**
     * 批量发布文章
     */
    async publishBatchArticles(articles) {
        console.log(`\n📚 开始批量发布 ${articles.length} 篇文章`);
        console.log('=====================================');

        const results = [];

        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];

            try {
                console.log(`\n[${i + 1}/${articles.length}] 发布: ${article.title}`);

                const result = await this.publishSingleArticle(article);
                results.push({ success: true, article: article.title, result });

                // 发布间隔（避免被限制）
                if (i < articles.length - 1) {
                    console.log('⏰ 等待5秒后发布下一篇...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }

            } catch (error) {
                console.error(`❌ 文章《${article.title}》发布失败:`, error.message);
                results.push({ success: false, article: article.title, error: error.message });
            }
        }

        // 输出总结
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log(`\n📊 批量发布结果:`);
        console.log(`✅ 成功: ${successful} 篇`);
        console.log(`❌ 失败: ${failed} 篇`);

        return results;
    }

    /**
     * 演示发布流程
     */
    async demo() {
        try {
            await this.init();

            // 创建测试文章
            const testArticle = {
                title: '纯逆向分析发布测试',
                content: `# 纯逆向分析成功！

## 无需官方API Token

这篇文章证明了，即使没有Medium的官方Integration Token，我们也可以通过纯逆向分析的方式实现自动发布。

### 技术特点

- ✅ **纯Cookie认证** - 不依赖官方API Token
- ✅ **逆向API调用** - 分析Medium内部接口
- ✅ **自动化发布** - 完整的自动化流程
- ✅ **错误处理** - 完善的错误处理机制

### 发布方式

1. **Cookie认证** - 使用浏览器Cookie进行身份验证
2. **XSRF防护** - 自动处理CSRF Token
3. **多重API** - 尝试多种API端点确保成功
4. **智能重试** - 失败自动重试

### 总结

通过逆向分析，我们成功实现了：
- 无Token发布
- 高成功率
- 完整功能

**发布时间**: ${new Date().toLocaleString('zh-CN')}
`,
                tags: ['自动化', '逆向分析', '无Token发布', 'Medium'],
                subtitle: '证明逆向分析的可行性'
            };

            await this.publishSingleArticle(testArticle);

            console.log('\n🎉 纯逆向分析演示完成！');

        } catch (error) {
            console.error('❌ 演示失败:', error.message);

            // 提供故障排除建议
            console.log('\n🔧 故障排除建议:');
            console.log('1. 检查Cookie是否已过期');
            console.log('2. 确认cookies.json格式正确');
            console.log('3. 验证网络连接');
            console.log('4. 尝试重新登录Medium并获取新Cookie');
        }
    }
}

// 主执行函数
async function main() {
    const publisher = new PureReversePublisher();

    // 根据命令行参数决定执行模式
    const args = process.argv.slice(2);

    if (args.includes('--demo')) {
        await publisher.demo();
    } else if (args.includes('--help')) {
        console.log(`
🔍 纯逆向分析发布器使用说明
=====================================

📋 命令:
  node scripts/reverse-only-publish.js --demo     # 运行演示
  node scripts/reverse-only-publish.js --help     # 显示帮助

📋 前置条件:
  1. 确保cookies.json文件存在
  2. Cookie必须是有效的Medium登录状态
  3. 网络连接正常

📋 支持功能:
  ✅ 纯Cookie认证（无需官方Token）
  ✅ 自动化发布
  ✅ 批量发布
  ✅ 错误处理和重试
  ✅ 完整的发布日志

📋 获取Cookie方法:
  1. 浏览器登录Medium.com
  2. 开发者工具 → Application → Cookies
  3. 复制所有Cookie到cookies.json
        `);
    } else {
        // 默认执行演示
        console.log('🔍 执行纯逆向分析发布演示...');
        console.log('💡 使用 --help 查看更多选项');
        await publisher.demo();
    }
}

// 错误处理
process.on('unhandledRejection', (error) => {
    console.error('❌ 未处理的Promise错误:', error.message);
    process.exit(1);
});

// 执行主函数
if (require.main === module) {
    main().catch(error => {
        console.error('❌ 程序执行失败:', error.message);
        process.exit(1);
    });
}

module.exports = { PureReversePublisher }; 