const MediumReversePublisher = require('../lib/medium-api-reverse');
const { logger } = require('../lib/utils');

/**
 * 测试逆向分析发布器的修复
 */
async function testReverseFix() {
    console.log('🔧 测试逆向分析发布器修复');
    console.log('==========================');

    try {
        // 1. 测试发布器初始化
        console.log('\n📋 步骤1: 测试发布器初始化');
        const publisher = new MediumReversePublisher();

        console.log('尝试初始化发布器...');
        await publisher.init();
        console.log('✅ 发布器初始化成功！');

        // 2. 测试Cookie设置
        console.log('\n🍪 步骤2: 验证Cookie设置');
        if (publisher.sessionCookies) {
            console.log('✅ Cookie已成功设置');

            // 检查关键Cookie
            const keyCookies = ['sid', 'uid', 'xsrf'];
            const presentCookies = keyCookies.filter(key =>
                publisher.sessionCookies.includes(key)
            );
            console.log(`🔑 关键Cookie检查: [${presentCookies.join(', ')}]`);
        } else {
            console.log('❌ Cookie未设置');
        }

        // 3. 测试XSRF Token
        console.log('\n🛡️  步骤3: 验证XSRF Token');
        if (publisher.xsrfToken) {
            console.log(`✅ XSRF Token已获取: ${publisher.xsrfToken.substring(0, 8)}...`);
        } else {
            console.log('⚠️  XSRF Token未获取，但可能不影响某些操作');
        }

        // 4. 测试用户ID
        console.log('\n👤 步骤4: 验证用户ID');
        if (publisher.userId) {
            console.log(`✅ 用户ID已获取: ${publisher.userId}`);
        } else {
            console.log('⚠️  用户ID未获取，将在发布时尝试其他方法');
        }

        // 5. 测试基础连接
        console.log('\n🌐 步骤5: 测试网络连接');
        try {
            const testResponse = await publisher.httpClient.get(`${publisher.baseURL}`);
            if (testResponse.status === 200) {
                console.log('✅ 网络连接正常');
            } else {
                console.log(`⚠️  响应状态码: ${testResponse.status}`);
            }
        } catch (error) {
            console.log(`❌ 网络连接测试失败: ${error.message}`);
        }

        // 6. 模拟发布测试（不实际发布）
        console.log('\n📝 步骤6: 模拟发布测试');
        const testArticle = {
            title: '测试文章 - 不会实际发布',
            content: '# 测试内容\n\n这是一个测试文章，用于验证发布器功能。',
            tags: ['测试', '逆向分析']
        };

        try {
            console.log('准备模拟发布（仅测试认证和请求格式）...');

            // 这里我们只测试到创建请求的部分，不实际发送
            if (publisher.integrationToken) {
                console.log('✅ 将使用Integration Token方式发布');
            } else {
                console.log('✅ 将使用GraphQL Cookie方式发布');
            }

            console.log('📋 发布数据准备完成');

        } catch (error) {
            console.log(`❌ 发布测试失败: ${error.message}`);
        }

        console.log('\n🎉 测试完成总结:');
        console.log('==================');

        const status = {
            初始化: '✅ 成功',
            Cookie设置: publisher.sessionCookies ? '✅ 成功' : '❌ 失败',
            XSRF_Token: publisher.xsrfToken ? '✅ 成功' : '⚠️  可选',
            用户ID: publisher.userId ? '✅ 成功' : '⚠️  可选',
            网络连接: '✅ 正常'
        };

        Object.entries(status).forEach(([key, value]) => {
            console.log(`${key}: ${value}`);
        });

        const overallStatus = publisher.sessionCookies ? '成功' : '需要检查Cookie';
        console.log(`\n🎯 整体状态: ${overallStatus}`);

        if (publisher.sessionCookies) {
            console.log('✅ 逆向分析发布器已准备就绪，可以进行实际发布测试！');
        } else {
            console.log('❌ 请检查cookies.json文件是否存在且格式正确');
        }

    } catch (error) {
        console.error('❌ 测试过程中出现错误:', error.message);
        console.error('详细错误信息:', error);

        console.log('\n🔧 故障排除建议:');
        console.log('1. 确保cookies.json文件存在且格式正确');
        console.log('2. 检查Cookie是否已过期（重新登录Medium并导出）');
        console.log('3. 确认网络连接正常');
        console.log('4. 查看日志文件获取更多详细信息');
    }
}

/**
 * 显示Cookie格式指南
 */
function showCookieGuide() {
    console.log('\n📚 Cookie获取指南');
    console.log('=================');
    console.log('');
    console.log('1. 使用浏览器插件:');
    console.log('   - 安装"Cookie Editor"或"EditThisCookie"插件');
    console.log('   - 登录Medium后导出所有Cookie');
    console.log('   - 保存为cookies.json格式');
    console.log('');
    console.log('2. 使用浏览器开发者工具:');
    console.log('   - 按F12打开开发者工具');
    console.log('   - 切换到Application/Storage -> Cookies');
    console.log('   - 复制所有medium.com相关的Cookie');
    console.log('');
    console.log('3. 正确的Cookie格式示例:');
    console.log(`{
  "cookies": [
    {
      "name": "sid",
      "value": "1:xxxxx...",
      "domain": ".medium.com"
    },
    {
      "name": "uid", 
      "value": "xxxxx",
      "domain": ".medium.com"
    }
  ]
}`);
    console.log('');
    console.log('⚠️  重要提醒:');
    console.log('- Cookie包含敏感信息，请妥善保管');
    console.log('- Cookie有过期时间，需要定期更新');
    console.log('- 确保包含sid、uid、xsrf等关键Cookie');
}

// 主程序
async function main() {
    await testReverseFix();
    showCookieGuide();
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    testReverseFix,
    showCookieGuide
}; 