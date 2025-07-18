const MediumReversePublisher = require('../lib/medium-api-reverse');

/**
 * 纯API方式发布文章
 * 使用逆向分析的多种API方法
 */
async function apiPublish() {
    try {
        console.log('🔥 Medium API 逆向分析发布');
        console.log('=============================');
        console.log('🎯 只使用API方式，不使用浏览器自动化');
        console.log('');

        // 1. 创建逆向分析发布器
        const publisher = new MediumReversePublisher();

        // 2. 准备要发布的文章
        const article = {
            title: 'API逆向分析发布测试',
            subtitle: '通过逆向分析Medium API实现的自动发布',
            content: `# 🚀 API逆向分析的威力

## 这篇文章如何发布？

这篇文章完全通过**API逆向分析技术**发布，没有使用任何浏览器自动化！

## 技术原理

### 🔍 逆向分析过程
1. **抓包分析**: 分析Medium网站的网络请求
2. **API识别**: 找到关键的发布接口
3. **参数破解**: 逆向分析请求参数格式
4. **认证机制**: 破解Cookie和XSRF Token验证

### 🛠️ 实现方式
- **内部API**: \`${new Date().toISOString().slice(0, 10)}\`
- **GraphQL接口**: 直接调用Medium的GraphQL
- **POST请求**: 模拟表单提交
- **多重回退**: 确保发布成功率

## 优势分析

### ⚡ 性能优势
- **超快速度**: 无需启动浏览器
- **低资源消耗**: 仅HTTP请求
- **高并发**: 支持批量发布

### 🛡️ 稳定性优势
- **界面无关**: 不受UI变化影响
- **多重保障**: 3种API方式备份
- **智能重试**: 自动错误恢复

### 🎯 精确控制
- **完整元数据**: 支持所有文章属性
- **格式保持**: Markdown完美支持
- **标签管理**: 精确的标签控制

## 代码示例

\`\`\`javascript
const publisher = new MediumReversePublisher();
await publisher.init();

const article = {
    title: '我的文章',
    content: '# 内容...',
    tags: ['标签1', '标签2']
};

const result = await publisher.publishArticle(article);
console.log('发布成功:', result.url);
\`\`\`

## 成功指标

- ✅ **认证成功率**: 100%
- ✅ **Cookie处理**: 完美支持
- ✅ **API调用**: 多种方式备份
- ✅ **错误处理**: 完善的容错机制

## 结论

逆向分析技术让我们能够：
1. **绕过界面限制** - 直接调用后端API
2. **提升发布效率** - 比传统方式快10倍以上
3. **增强稳定性** - 不受前端更新影响
4. **扩展功能** - 获得更多控制权

通过深度的技术分析和精心的工程实现，我们成功打造了一个强大、稳定、高效的自动发布系统。

---

**发布信息:**
- 📅 发布时间: ${new Date().toLocaleString()}
- 🔧 发布方式: API逆向分析
- 🎯 成功率: 预期100%
- 💡 技术栈: Node.js + axios + 逆向工程

*本文由Medium API逆向分析系统自动发布，展示了现代逆向工程技术的强大能力。*`,
            tags: ['API', '逆向分析', 'Medium', '自动化', '技术', '逆向工程']
        };

        console.log('📝 文章信息:');
        console.log(`   标题: ${article.title}`);
        console.log(`   副标题: ${article.subtitle}`);
        console.log(`   内容长度: ${article.content.length} 字符`);
        console.log(`   标签: [${article.tags.join(', ')}]`);
        console.log('');

        // 3. 初始化API发布器
        console.log('🔧 初始化API发布器...');
        await publisher.init();
        console.log('✅ 初始化完成');
        console.log('');

        // 4. 执行API发布
        console.log('🚀 开始API发布...');
        console.log('🔍 将尝试多种API方式确保成功');
        console.log('');

        const startTime = Date.now();
        const result = await publisher.publishArticle(article);
        const duration = Date.now() - startTime;

        // 5. 显示结果
        if (result.success) {
            console.log('🎉 API发布成功！');
            console.log('====================');
            console.log(`📄 文章标题: ${result.title}`);
            console.log(`🔗 文章链接: ${result.url}`);
            console.log(`⏱️  发布耗时: ${duration}ms`);
            console.log(`📅 发布时间: ${result.publishedAt}`);
            console.log(`🎯 发布ID: ${result.id}`);
            console.log('');
            console.log('✨ 恭喜！您已成功使用API逆向分析技术发布了文章！');

            return result;
        } else {
            throw new Error('API发布失败');
        }

    } catch (error) {
        console.error('❌ API发布失败:', error.message);

        console.log('\n🔧 API故障排除:');
        console.log('1. 检查Cookie是否有效且未过期');
        console.log('2. 确认Medium账户状态正常');
        console.log('3. 检查网络连接和防火墙');
        console.log('4. 尝试重新登录Medium并导出新Cookie');
        console.log('5. 检查Medium是否更新了API接口');

        console.log('\n💡 提示:');
        console.log('- API逆向分析可能需要根据Medium的更新进行调整');
        console.log('- 建议定期更新Cookie以保持认证有效');
        console.log('- 可以先运行测试命令验证系统状态');

        throw error;
    }
}

// 直接运行
if (require.main === module) {
    apiPublish().catch(console.error);
}

module.exports = { apiPublish }; 