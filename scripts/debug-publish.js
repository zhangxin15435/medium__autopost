#!/usr/bin/env node

/**
 * Medium发布调试工具
 * 可视化调试发布过程，帮助识别页面结构问题
 */

const MediumPublisher = require('../lib/medium-publisher');
const { logger, articleManager } = require('../lib/utils');

class PublishDebugger {
    constructor() {
        this.publisher = null;
    }

    /**
     * 启动调试模式发布
     */
    async debugPublish() {
        try {
            console.log('\n🐛 启动Medium发布调试模式\n');

            // 创建发布器实例（显示浏览器）
            this.publisher = new MediumPublisher({
                headless: false, // 显示浏览器
                slowMo: 500      // 慢速操作便于观察
            });

            // 初始化浏览器
            await this.publisher.init();
            console.log('✅ 浏览器已启动（可见模式）');

            // 登录
            console.log('🔑 开始登录...');
            await this.publisher.login();
            console.log('✅ 登录成功');

            // 手动暂停，让用户观察
            console.log('\n⏸️  当前已登录Medium，按任意键继续到写作页面...');
            await this.waitForUserInput();

            // 访问写作页面
            console.log('📝 正在访问写作页面...');
            await this.publisher.page.goto('https://medium.com/new-story', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 等待页面加载
            await this.publisher.page.waitForTimeout(3000);

            // 分析页面
            console.log('🔍 分析页面结构...');
            const pageInfo = await this.analyzePageStructure();
            this.printPageAnalysis(pageInfo);

            // 尝试查找标题元素
            console.log('\n📝 尝试查找标题输入框...');
            const titleElement = await this.publisher.findTitleElement();

            if (titleElement) {
                console.log('✅ 找到标题元素！');

                // 高亮显示标题元素
                await this.highlightElement(titleElement, '标题元素');

                console.log('\n⏸️  标题元素已高亮显示，按任意键继续...');
                await this.waitForUserInput();

                // 测试输入标题
                console.log('📝 测试输入标题...');
                await titleElement.click();
                await this.publisher.page.waitForTimeout(500);
                await titleElement.type('测试标题', { delay: 100 });

            } else {
                console.log('❌ 未找到标题元素');
                console.log('📊 所有可编辑元素:');
                await this.showAllEditableElements();
            }

            // 查找内容元素
            console.log('\n📄 尝试查找内容输入区域...');
            const contentElement = await this.publisher.findContentElement();

            if (contentElement) {
                console.log('✅ 找到内容元素！');
                await this.highlightElement(contentElement, '内容元素');
            } else {
                console.log('❌ 未找到内容元素');
            }

            // 手动暂停
            console.log('\n⏸️  调试完成，浏览器将保持打开状态供您查看');
            console.log('💡 您可以手动测试页面元素，按任意键关闭浏览器...');
            await this.waitForUserInput();

        } catch (error) {
            console.error('❌ 调试过程中发生错误:', error.message);
        } finally {
            if (this.publisher) {
                await this.publisher.close();
                console.log('🔒 浏览器已关闭');
            }
        }
    }

    /**
     * 分析页面结构
     */
    async analyzePageStructure() {
        return await this.publisher.page.evaluate(() => {
            const analysis = {
                url: window.location.href,
                title: document.title,
                editableElements: [],
                buttons: [],
                inputs: [],
                headings: []
            };

            // 分析可编辑元素
            const editableElements = document.querySelectorAll('[contenteditable="true"]');
            editableElements.forEach((el, index) => {
                analysis.editableElements.push({
                    index: index,
                    tagName: el.tagName,
                    textContent: el.textContent || '',
                    placeholder: el.getAttribute('placeholder') || '',
                    className: el.className || '',
                    id: el.id || '',
                    boundingRect: el.getBoundingClientRect()
                });
            });

            // 分析按钮
            const buttons = document.querySelectorAll('button');
            buttons.forEach((btn, index) => {
                const text = btn.textContent.trim();
                if (text) {
                    analysis.buttons.push({
                        index: index,
                        text: text,
                        className: btn.className || '',
                        disabled: btn.disabled
                    });
                }
            });

            // 分析输入框
            const inputs = document.querySelectorAll('input, textarea');
            inputs.forEach((input, index) => {
                analysis.inputs.push({
                    index: index,
                    type: input.type,
                    placeholder: input.placeholder || '',
                    name: input.name || '',
                    className: input.className || ''
                });
            });

            // 分析标题元素
            const headings = document.querySelectorAll('h1, h2, h3');
            headings.forEach((h, index) => {
                analysis.headings.push({
                    index: index,
                    tagName: h.tagName,
                    textContent: h.textContent.trim(),
                    className: h.className || ''
                });
            });

            return analysis;
        });
    }

    /**
     * 打印页面分析结果
     */
    printPageAnalysis(pageInfo) {
        console.log('\n📊 页面结构分析结果:');
        console.log(`🌐 URL: ${pageInfo.url}`);
        console.log(`📄 标题: ${pageInfo.title}`);

        console.log(`\n✏️  可编辑元素 (${pageInfo.editableElements.length} 个):`);
        pageInfo.editableElements.forEach(el => {
            console.log(`  ${el.index}: ${el.tagName} - "${el.textContent}" [${el.className}]`);
        });

        console.log(`\n🔘 按钮 (${pageInfo.buttons.length} 个):`);
        pageInfo.buttons.slice(0, 10).forEach(btn => {
            console.log(`  "${btn.text}" [${btn.className}]`);
        });

        console.log(`\n📝 输入框 (${pageInfo.inputs.length} 个):`);
        pageInfo.inputs.forEach(input => {
            console.log(`  ${input.type} - "${input.placeholder}" [${input.className}]`);
        });
    }

    /**
     * 高亮显示元素
     */
    async highlightElement(element, description) {
        await this.publisher.page.evaluate((el, desc) => {
            el.style.border = '3px solid red';
            el.style.backgroundColor = 'yellow';
            el.style.opacity = '0.8';

            // 添加标签
            const label = document.createElement('div');
            label.textContent = desc;
            label.style.position = 'absolute';
            label.style.top = '10px';
            label.style.left = '10px';
            label.style.backgroundColor = 'red';
            label.style.color = 'white';
            label.style.padding = '5px';
            label.style.zIndex = '9999';
            label.style.fontSize = '14px';
            document.body.appendChild(label);

        }, element, description);
    }

    /**
     * 显示所有可编辑元素
     */
    async showAllEditableElements() {
        const elements = await this.publisher.page.$$('[contenteditable="true"]');

        console.log(`找到 ${elements.length} 个可编辑元素:`);

        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];

            const info = await this.publisher.page.evaluate((el, index) => {
                return {
                    tagName: el.tagName,
                    textContent: el.textContent || '',
                    className: el.className || '',
                    placeholder: el.getAttribute('placeholder') || '',
                    rect: el.getBoundingClientRect()
                };
            }, element, i);

            console.log(`  ${i + 1}. ${info.tagName} - "${info.textContent}" [${info.className}]`);

            // 高亮每个元素
            await this.highlightElement(element, `元素 ${i + 1}`);
        }
    }

    /**
     * 等待用户输入
     */
    async waitForUserInput() {
        return new Promise((resolve) => {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.once('data', () => {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                resolve();
            });
        });
    }
}

// 主函数
async function main() {
    try {
        const debugTool = new PublishDebugger();
        await debugTool.debugPublish();
    } catch (error) {
        console.error('调试工具执行失败:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = PublishDebugger; 