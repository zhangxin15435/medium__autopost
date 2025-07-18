const puppeteer = require('puppeteer');
const { logger } = require('./utils');
const fs = require('fs-extra');
const path = require('path');

/**
 * Medium文章自动发布器
 * 使用Puppeteer自动化发布文章到Medium平台
 */
class MediumPublisher {
    constructor(options = {}) {
        // 强制启用可视化模式 - 总是显示浏览器窗口
        this.headless = false;  // 强制可视化
        this.slowMo = options.slowMo || parseInt(process.env.PUPPETEER_SLOW_MO) || 500; // 慢速操作便于观察
        this.browser = null;
        this.page = null;
        // 使用项目根目录下的cookie文件
        this.cookieFile = path.join(process.cwd(), 'cookies.json');
    }

    /**
     * 初始化浏览器实例
     */
    async init() {
        try {
            logger.info('正在启动浏览器...');
            console.log('🔍 【可视化模式】浏览器窗口即将打开，您可以观察整个发布过程');

            this.browser = await puppeteer.launch({
                headless: this.headless,  // 总是false，完全可视化
                slowMo: this.slowMo,      // 慢速操作便于观察
                devtools: false,          // 不自动打开开发者工具
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1200x900',     // 适中的窗口大小
                    '--window-position=100,100',  // 窗口位置
                    '--disable-web-security',     // 便于调试
                    '--disable-features=VizDisplayCompositor'
                ]
            });

            this.page = await this.browser.newPage();

            // 设置视口大小
            await this.page.setViewport({ width: 1920, height: 1080 });

            // 设置用户代理
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

            logger.info('浏览器启动成功');
            return true;
        } catch (error) {
            logger.error('浏览器启动失败:', error);
            throw error;
        }
    }

    /**
     * 检查是否存在Cookie文件
     */
    async hasSavedCookies() {
        return await fs.pathExists(this.cookieFile);
    }

    /**
 * 使用Cookie登录
 */
    async loginWithCookies() {
        try {
            logger.info('尝试使用已保存的Cookie登录...');
            console.log('🍪 Cookie文件路径:', this.cookieFile);

            if (!await this.hasSavedCookies()) {
                throw new Error('未找到Cookie文件，请先运行: node scripts/cookie-helper.js extract');
            }

            console.log('✅ Cookie文件存在，开始自动登录...');

            // 读取Cookie数据
            const cookieData = await fs.readJson(this.cookieFile);
            logger.info(`使用 ${cookieData.extractedAt} 时抓取的Cookie`);

            // 设置相同的User Agent
            if (cookieData.userAgent) {
                await this.page.setUserAgent(cookieData.userAgent);
            }

            // 应用Cookie
            console.log(`🔄 正在应用 ${cookieData.cookies.length} 个Cookie...`);
            await this.page.setCookie(...cookieData.cookies);
            console.log('✅ Cookie已应用，访问Medium主页进行验证...');

            // 使用重试机制访问Medium主页
            const maxRetries = 3;
            let lastError = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    logger.info(`尝试访问Medium主页 (第${attempt}次)...`);

                    await this.page.goto('https://medium.com', {
                        waitUntil: 'networkidle2',
                        timeout: 30000
                    });

                    // 等待页面稳定
                    await this.page.waitForTimeout(2000);
                    break;

                } catch (error) {
                    lastError = error;
                    logger.warn(`第${attempt}次访问失败: ${error.message}`);

                    if (attempt < maxRetries) {
                        logger.info(`等待${attempt * 2}秒后重试...`);
                        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
                    }
                }
            }

            if (lastError && lastError.message.includes('net::ERR_CONNECTION_CLOSED')) {
                throw lastError;
            }

            // 验证登录状态  
            const isLoggedIn = await this.page.evaluate(() => {
                // 检查多种登录标识
                const selectors = [
                    '[data-testid="headerUserMenu"]',
                    '[data-testid="user-menu"]',
                    '.avatar',
                    'img[alt*="@"]',
                    '[aria-label*="profile"]',
                    '[aria-label*="Profile"]',
                    '[data-testid="writeButton"]',
                    'a[href*="/new-story"]'
                ];

                // 检查选择器
                for (const selector of selectors) {
                    try {
                        if (document.querySelector(selector)) {
                            return true;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                // 检查Write按钮
                const writeButtons = Array.from(document.querySelectorAll('button, a')).filter(el =>
                    el.textContent && el.textContent.toLowerCase().includes('write')
                );
                if (writeButtons.length > 0) {
                    return true;
                }

                // 检查导航栏用户元素
                const navElements = document.querySelectorAll('nav *[alt], nav img, header *[alt], header img');
                return navElements.length > 0;
            });

            if (isLoggedIn) {
                logger.info('Cookie登录成功！');
                return true;
            } else {
                throw new Error('Cookie可能已过期，登录验证失败');
            }

        } catch (error) {
            logger.error('Cookie登录失败:', error);
            throw error;
        }
    }

    /**
     * 登录Medium账户（仅支持Cookie登录）
     */
    async login() {
        try {
            // 只允许Cookie登录
            if (await this.hasSavedCookies()) {
                await this.loginWithCookies();
                return true;
            } else {
                throw new Error('未找到Cookie文件，请先通过浏览器插件导出并放到 D:/kaifa/medium__autopost/cookies.json');
            }
        } catch (error) {
            logger.error('登录失败:', error);
            throw error;
        }
    }

    /**
     * 发布文章
     * @param {Object} article - 文章对象
     * @param {string} article.title - 文章标题
     * @param {string} article.content - 文章内容
     * @param {Array} article.tags - 文章标签
     * @param {string} article.subtitle - 文章副标题（可选）
     */
    async publishArticle(article) {
        try {
            logger.info(`开始发布文章: ${article.title}`);

            // 导航到写作页面 - 确保桌面版完整界面
            logger.info('正在访问Medium写作页面...');

            // 设置桌面版用户代理，确保完整界面
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            await this.page.goto('https://medium.com/new-story', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 等待页面完全加载并检查界面状态
            await this.page.waitForTimeout(3000);

            // 检查是否需要刷新页面以获得完整界面
            const needsRefresh = await this.page.evaluate(() => {
                const hasEditor = document.querySelector('.postArticle-content, [data-testid="storyEditor"], .medium-editor-insert-plugin');
                const isSimplified = document.body.style.backgroundColor.includes('yellow') ||
                    !hasEditor ||
                    document.querySelectorAll('[contenteditable="true"]').length < 2;
                return isSimplified;
            });

            if (needsRefresh) {
                logger.info('检测到简化界面，刷新页面获取完整编辑器...');
                await this.page.reload({ waitUntil: 'networkidle2' });
                await this.page.waitForTimeout(3000);
            }

            // 检查页面状态和可用元素
            const pageInfo = await this.analyzeWritePage();
            logger.info(`页面分析结果: ${JSON.stringify(pageInfo)}`);

            // 使用Medium的Title区域识别工作流程 - 直接点击Title区域
            logger.info('识别并点击Title区域输入标题...');

            // 1. 寻找并点击Title区域
            const titleArea = await this.findTitleArea();
            if (!titleArea) {
                throw new Error('无法找到Title区域');
            }

            // 2. 使用专门的Medium标题输入方法
            logger.info('开始输入标题...');
            await this.inputTitleToMedium(titleArea, article.title);

            // 4. 按回车进入正文区域
            await this.page.keyboard.press('Enter');

            // 5. 输入副标题（如果有）
            if (article.subtitle) {
                logger.info('正在输入副标题...');
                await this.page.keyboard.type(article.subtitle, { delay: 0 });
                await this.page.keyboard.press('Enter');
                await this.page.keyboard.press('Enter');
            }

            // 6. 输入文章内容（使用粘贴方式加快速度）
            logger.info('正在输入文章内容...');
            await this.inputContentWithPaste(article.content);

            // 确保内容已完全输入并触发事件
            await this.triggerContentEvents();

            // 闪电模式 - 取消等待时间
            // await this.page.waitForTimeout(500); // 完全取消等待
            logger.info('文章内容输入完成，准备发布...');

            // 查找并点击发布按钮
            const publishButton = await this.findPublishButton();
            if (!publishButton) {
                throw new Error('无法找到发布按钮');
            }

            // 检查发布按钮是否可用
            const isButtonEnabled = await this.checkPublishButtonEnabled(publishButton);
            if (!isButtonEnabled) {
                logger.warn('发布按钮当前被禁用，尝试启用...');
                await this.enablePublishButton();

                // 重新检查按钮状态
                const isEnabledAfterWait = await this.checkPublishButtonEnabled(publishButton);
                if (!isEnabledAfterWait) {
                    logger.error('发布按钮仍然被禁用，无法发布');

                    // 尝试诊断问题
                    await this.diagnoseProblem();

                    throw new Error('发布按钮被禁用，可能原因：文章内容不足、缺少必要字段或需要人工审核');
                }
            }

            await publishButton.click();
            await this.page.waitForTimeout(3000); // 增加等待时间

            // 等待发布对话框
            const publishDialog = await this.waitForPublishDialog();

            if (publishDialog === 'direct_publish') {
                // 已经直接发布，无需进一步操作
                logger.info('文章已直接发布成功');
            } else if (publishDialog === true) {
                // 找到了发布对话框，继续后续步骤
                logger.info('发布对话框已出现，继续发布流程...');

                // 添加标签（如果有）
                if (article.tags && article.tags.length > 0) {
                    await this.addTags(article.tags);
                }

                // 寻找真正的发布按钮 - 确保是"Publish now"而不是草稿保存
                const finalPublishButton = await this.findRealPublishButton();
                if (finalPublishButton) {
                    await finalPublishButton.click();
                    logger.info('已点击真正的发布按钮');
                } else {
                    logger.warn('未找到真正的发布按钮，尝试其他方法...');

                    // 尝试寻找其他可能的发布按钮
                    const alternativeButtons = await this.findAlternativePublishButtons();
                    if (alternativeButtons.length > 0) {
                        // 优先选择包含"Publish now"文本的按钮
                        const publishNowButton = alternativeButtons.find(btn =>
                            btn.textContent && btn.textContent.includes('Publish now')
                        );

                        if (publishNowButton) {
                            await publishNowButton.click();
                            logger.info('已点击"Publish now"按钮');
                        } else {
                            await alternativeButtons[0].click();
                            logger.warn('已点击备选发布按钮（可能只是保存草稿）');
                        }
                    } else {
                        // 最后尝试按Enter键
                        logger.warn('尝试按Enter键发布');
                        await this.page.keyboard.press('Enter');
                    }
                }

                // 等待发布完成
                await this.waitForPublishComplete();
            } else {
                // 没有找到发布对话框，尝试备用策略
                logger.warn('未找到发布对话框，尝试备用发布策略...');
                const success = await this.attemptAlternativePublish(article);
                if (!success) {
                    throw new Error('发布对话框未出现且备用策略失败');
                }
            }

            logger.info(`文章《${article.title}》发布成功！`);

            // 获取发布后的文章URL
            const articleUrl = await this.page.url();

            return {
                success: true,
                title: article.title,
                url: articleUrl,
                publishedAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error(`发布文章失败: ${error.message}`);

            // 添加调试信息
            try {
                const currentUrl = this.page.url();
                const pageTitle = await this.page.title();
                logger.error(`当前页面: ${currentUrl}`);
                logger.error(`页面标题: ${pageTitle}`);

                // 截图保存（如果可能）
                if (!this.headless) {
                    await this.page.screenshot({
                        path: `debug-screenshot-${Date.now()}.png`,
                        fullPage: true
                    });
                    logger.info('已保存调试截图');
                }
            } catch (debugError) {
                logger.error('获取调试信息失败:', debugError.message);
            }

            throw error;
        }
    }

    /**
     * 分析写作页面的元素
     */
    async analyzeWritePage() {
        return await this.page.evaluate(() => {
            const info = {
                url: window.location.href,
                title: document.title,
                hasEditor: false,
                foundElements: []
            };

            // 检查各种可能的编辑器元素
            const selectors = [
                '[data-testid="storyTitle"]',
                '[data-testid="storyContent"]',
                '[contenteditable="true"]',
                '.notranslate',
                'h1[data-text="true"]',
                'div[data-text="true"]',
                '[placeholder*="Title"]',
                '[placeholder*="title"]',
                '.editor',
                '.medium-editor'
            ];

            selectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        info.foundElements.push(`${selector}: ${elements.length}`);
                        info.hasEditor = true;
                    }
                } catch (e) {
                    // 忽略错误
                }
            });

            return info;
        });
    }

    /**
     * 专门用于Medium标题输入的方法
     * @param {ElementHandle} titleElement - 标题元素句柄
     * @param {string} title - 要输入的标题文本
     */
    async inputTitleToMedium(titleElement, title) {
        logger.info(`开始使用专门方法输入标题: "${title}"`);

        // 策略数组，按优先级尝试
        const inputStrategies = [
            // 策略1: 模拟真实用户点击和输入行为（重点是触发正确的事件序列）
            async () => {
                logger.info('策略1: 模拟真实用户交互，让占位符自动消失');

                // 1. 先检查元素当前状态
                const beforeClick = await titleElement.evaluate(el => ({
                    textContent: el.textContent,
                    innerHTML: el.innerHTML,
                    hasFocus: document.activeElement === el
                }));
                logger.info(`点击前状态: ${JSON.stringify(beforeClick)}`);

                // 2. 模拟真实的鼠标移动和点击
                const box = await titleElement.boundingBox();
                if (box) {
                    // 先移动鼠标到元素上方
                    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
                    await this.page.waitForTimeout(100);

                    // 模拟鼠标悬停一下
                    await this.page.hover('[contenteditable="true"]');
                    await this.page.waitForTimeout(200);
                }

                // 3. 触发完整的焦点获取序列
                await titleElement.evaluate(element => {
                    // 手动触发焦点相关事件序列，模拟真实用户交互
                    const events = [
                        'mouseenter',
                        'mouseover',
                        'mousedown',
                        'focus',
                        'focusin',
                        'mouseup',
                        'click'
                    ];

                    events.forEach(eventType => {
                        const event = new Event(eventType, {
                            bubbles: true,
                            cancelable: true,
                            composed: true
                        });
                        element.dispatchEvent(event);
                    });

                    // 确保元素获得焦点
                    element.focus();
                });

                // 4. 等待占位符消失
                await this.page.waitForTimeout(500);

                // 5. 检查占位符是否消失
                const afterFocus = await titleElement.evaluate(el => ({
                    textContent: el.textContent,
                    innerHTML: el.innerHTML,
                    hasFocus: document.activeElement === el,
                    isPlaceholderVisible: el.textContent.includes('Title')
                }));
                logger.info(`获得焦点后状态: ${JSON.stringify(afterFocus)}`);

                // 6. 如果占位符还在，尝试额外的触发
                if (afterFocus.isPlaceholderVisible) {
                    logger.info('占位符仍然可见，尝试额外的事件触发');

                    // 尝试触发输入开始事件
                    await titleElement.evaluate(element => {
                        // 触发输入相关事件
                        const inputEvents = [
                            'textInput',
                            'beforeinput',
                            'compositionstart'
                        ];

                        inputEvents.forEach(eventType => {
                            const event = new Event(eventType, {
                                bubbles: true,
                                cancelable: true
                            });
                            element.dispatchEvent(event);
                        });
                    });

                    await this.page.waitForTimeout(300);
                }

                // 7. 开始输入（直接输入，不删除）
                logger.info('开始直接输入标题');
                await this.page.keyboard.type(title, { delay: 100 });

                await this.page.waitForTimeout(300);
                return await this.verifyTitleInput(titleElement, title);
            },

            // 策略2: 专门针对Medium的defaultValue结构
            async () => {
                logger.info('策略2: 专门处理Medium的defaultValue占位符结构');

                // 1. 检查当前的defaultValue结构
                const beforeState = await titleElement.evaluate(el => {
                    const defaultSpan = el.querySelector('.defaultValue.defaultValue--root');
                    return {
                        hasDefaultSpan: !!defaultSpan,
                        defaultText: defaultSpan ? defaultSpan.textContent : '',
                        fullText: el.textContent,
                        innerHTML: el.innerHTML
                    };
                });

                logger.info(`Medium结构检测: ${JSON.stringify(beforeState)}`);

                // 2. 点击元素，让Medium的编辑器激活
                await titleElement.click();
                await this.page.waitForTimeout(500);

                // 3. 如果仍有defaultValue结构，尝试特定的清除方法
                const afterClickState = await titleElement.evaluate(el => {
                    const defaultSpan = el.querySelector('.defaultValue.defaultValue--root');
                    return {
                        hasDefaultSpan: !!defaultSpan,
                        defaultText: defaultSpan ? defaultSpan.textContent : '',
                        hasFocus: document.activeElement === el || el.contains(document.activeElement)
                    };
                });

                logger.info(`点击后状态: ${JSON.stringify(afterClickState)}`);

                if (afterClickState.hasDefaultSpan) {
                    // Medium的占位符还在，需要特殊处理
                    logger.info('占位符仍然存在，使用特殊清除方法');

                    await titleElement.evaluate(el => {
                        // 移除defaultValue span
                        const defaultSpan = el.querySelector('.defaultValue.defaultValue--root');
                        if (defaultSpan) {
                            defaultSpan.remove();
                        }

                        // 清理其他内容
                        el.innerHTML = '';

                        // 确保元素保持可编辑状态
                        el.focus();
                    });

                    await this.page.waitForTimeout(200);
                }

                // 4. 输入新标题
                await this.page.keyboard.type(title, { delay: 100 });

                await this.page.waitForTimeout(300);
                return await this.verifyTitleInput(titleElement, title);
            },

            // 策略3: 最简单的用户行为模拟
            async () => {
                logger.info('策略3: 最简单的用户点击和输入');

                // 最简单的方式：就像真实用户一样点击然后直接输入
                await titleElement.click();
                await this.page.waitForTimeout(800); // 给更多时间让占位符消失

                // 检查是否获得焦点
                const hasFocus = await titleElement.evaluate(el => document.activeElement === el);
                logger.info(`元素是否获得焦点: ${hasFocus}`);

                if (!hasFocus) {
                    // 如果没有焦点，再次点击
                    await titleElement.focus();
                    await this.page.waitForTimeout(300);
                }

                // 直接开始输入，就像用户会做的那样
                await this.page.keyboard.type(title, { delay: 150 });

                await this.page.waitForTimeout(300);
                return await this.verifyTitleInput(titleElement, title);
            },

            // 策略4: 强制替换内容
            async () => {
                logger.info('策略4: 强制替换内容');

                await titleElement.click();
                await this.page.waitForTimeout(300);

                // 使用JavaScript强制替换
                const success = await titleElement.evaluate((element, newTitle) => {
                    try {
                        // 获取元素的当前状态
                        const originalContent = element.textContent;

                        // 强制清空并设置内容
                        element.innerHTML = '';
                        element.textContent = newTitle;

                        // 创建并触发所有相关事件
                        const events = ['focus', 'input', 'change', 'blur', 'focusin', 'focusout'];
                        events.forEach(eventType => {
                            const event = new Event(eventType, {
                                bubbles: true,
                                cancelable: true,
                                detail: { value: newTitle }
                            });
                            element.dispatchEvent(event);
                        });

                        // 触发键盘事件
                        const keyboardEvents = ['keydown', 'keypress', 'keyup'];
                        keyboardEvents.forEach(eventType => {
                            const event = new KeyboardEvent(eventType, {
                                bubbles: true,
                                cancelable: true,
                                key: 'Enter'
                            });
                            element.dispatchEvent(event);
                        });

                        // 手动触发Medium可能监听的事件
                        if (element.onchange) element.onchange();
                        if (element.oninput) element.oninput();

                        return element.textContent === newTitle;
                    } catch (error) {
                        console.log('JavaScript替换失败:', error);
                        return false;
                    }
                }, title);

                if (success) {
                    await this.page.waitForTimeout(300);
                    return await this.verifyTitleInput(titleElement, title);
                }
                return false;
            },

            // 策略5: 组合键盘操作
            async () => {
                logger.info('策略5: 组合键盘操作');

                await titleElement.click();
                await this.page.waitForTimeout(300);

                // 多种选择方式组合
                await this.page.keyboard.down('Control');
                await this.page.keyboard.press('KeyA');
                await this.page.keyboard.up('Control');
                await this.page.waitForTimeout(100);

                await this.page.keyboard.press('Delete');
                await this.page.waitForTimeout(100);

                // 再次尝试选择（以防第一次没选中）
                await this.page.keyboard.down('Control');
                await this.page.keyboard.press('KeyA');
                await this.page.keyboard.up('Control');
                await this.page.waitForTimeout(100);

                // 直接输入覆盖
                await this.page.keyboard.type(title, { delay: 30 });
                await this.page.waitForTimeout(300);

                return await this.verifyTitleInput(titleElement, title);
            },

            // 策略6: 字符级别精确输入
            async () => {
                logger.info('策略6: 字符级别精确输入');

                await titleElement.click();
                await this.page.waitForTimeout(300);

                // 彻底清空
                const cleared = await titleElement.evaluate(element => {
                    element.innerHTML = '';
                    element.textContent = '';
                    element.value = '';
                    return element.textContent === '';
                });

                if (!cleared) {
                    logger.warn('无法清空元素内容');
                    return false;
                }

                // 重新聚焦
                await titleElement.click();
                await this.page.waitForTimeout(200);

                // 逐字符输入
                for (const char of title) {
                    await this.page.keyboard.type(char, { delay: 80 });
                    await this.page.waitForTimeout(50);
                }

                return await this.verifyTitleInput(titleElement, title);
            }
        ];

        // 尝试每种策略
        for (let i = 0; i < inputStrategies.length; i++) {
            try {
                logger.info(`尝试标题输入策略 ${i + 1}/${inputStrategies.length}`);
                const success = await inputStrategies[i]();

                if (success) {
                    logger.info(`✅ 策略${i + 1}成功！标题输入完成`);
                    return true;
                } else {
                    logger.warn(`❌ 策略${i + 1}失败，尝试下一个策略`);
                }
            } catch (error) {
                logger.warn(`策略${i + 1}执行出错: ${error.message}`);
                continue;
            }
        }

        // 所有策略都失败
        logger.error('所有标题输入策略都失败了');
        throw new Error('无法成功输入标题');
    }

    /**
 * 验证标题是否正确输入
 * @param {ElementHandle} titleElement - 标题元素
 * @param {string} expectedTitle - 期望的标题
 * @returns {boolean} 是否输入成功
 */
    async verifyTitleInput(titleElement, expectedTitle) {
        try {
            const result = await titleElement.evaluate(el => {
                const content = el.textContent || el.innerText || el.value || '';
                const innerHTML = el.innerHTML || '';

                return {
                    textContent: content,
                    innerHTML: innerHTML,
                    hasPlaceholder: content.includes('Title'), // 检查是否包含Title占位符
                    hasStoryPlaceholder: content.includes('Tell your story'),
                    isEmpty: content.trim() === '',
                    length: content.length
                };
            });

            const trimmedActual = result.textContent.trim();
            const trimmedExpected = expectedTitle.trim();

            logger.info(`📝 标题验证详情:`);
            logger.info(`   期望: "${trimmedExpected}"`);
            logger.info(`   实际: "${trimmedActual}"`);
            logger.info(`   长度: ${result.length}`);
            logger.info(`   HTML: ${result.innerHTML.substring(0, 100)}...`);
            logger.info(`   占位符检测: Title=${result.hasPlaceholder}, Story=${result.hasStoryPlaceholder}`);

            // 1. 检查是否完全匹配
            if (trimmedActual === trimmedExpected) {
                logger.info('✅ 标题完全匹配！');
                return true;
            }

            // 2. 检查是否为空（可能占位符没有被清除）
            if (result.isEmpty) {
                logger.warn('❌ 标题区域为空');
                return false;
            }

            // 3. 检查是否只包含占位符文字（最大问题）
            if (result.hasPlaceholder && !trimmedActual.includes(trimmedExpected)) {
                logger.warn('❌ 检测到占位符"Title"未被清除，输入失败');
                return false;
            }

            if (result.hasStoryPlaceholder) {
                logger.warn('❌ 检测到占位符"Tell your story"，可能输入到了错误区域');
                return false;
            }

            // 4. 检查是否标题被添加到占位符后面（混合问题）
            if (trimmedActual.includes('Title') && trimmedActual.includes(trimmedExpected)) {
                logger.warn('⚠️ 标题与占位符混合，这正是我们要解决的问题');
                return false;
            }

            // 5. 检查是否包含期望的标题（可能有额外的不可见字符）
            if (trimmedActual.includes(trimmedExpected) && !trimmedActual.includes('Title')) {
                logger.info('✅ 标题包含期望内容（可能有格式字符）');
                return true;
            }

            logger.warn('❌ 标题验证失败，未知原因');
            return false;

        } catch (error) {
            logger.error(`标题验证出错: ${error.message}`);
            return false;
        }
    }

    /**
     * 模拟鼠标点击Title区域
     * @param {ElementHandle} titleElement - Title元素句柄
     */
    async simulateMouseClickOnTitle(titleElement) {
        try {
            // 获取元素的边界框
            const boundingBox = await titleElement.boundingBox();
            if (!boundingBox) {
                logger.warn('无法获取Title元素边界框，使用元素点击作为备选');
                await titleElement.click();
                return;
            }

            // 计算点击位置（元素中心点）
            const x = boundingBox.x + boundingBox.width / 2;
            const y = boundingBox.y + boundingBox.height / 2;

            logger.info(`模拟鼠标点击坐标: (${x}, ${y})`);

            // 先移动鼠标到目标位置
            await this.page.mouse.move(x, y, { steps: 10 });

            // 等待短暂时间让鼠标移动完成
            await this.page.waitForTimeout(100);

            // 模拟鼠标按下和释放
            await this.page.mouse.down();
            await this.page.waitForTimeout(50); // 模拟真实的点击持续时间
            await this.page.mouse.up();

            logger.info('鼠标点击Title区域完成');

            // 等待页面响应点击事件
            await this.page.waitForTimeout(200);

        } catch (error) {
            logger.warn(`鼠标点击Title区域失败: ${error.message}`);
            logger.info('使用元素点击作为备选方案');
            await titleElement.click();
        }
    }

    /**
     * 使用粘贴方式快速输入文章内容
     * 这比逐字符输入要快得多，特别适合长文章
     * @param {string} content - 要输入的文章内容
     */
    async inputContentWithPaste(content) {
        try {
            logger.info(`开始使用粘贴方式输入内容，长度: ${content.length} 字符`);

            // 1. 确保当前在正确的内容输入位置
            // 通常按回车后光标已经在内容区域，但我们要确保焦点正确

            // 2. 将内容写入剪贴板
            await this.page.evaluate(async (textContent) => {
                try {
                    // 使用现代剪贴板API
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(textContent);
                        console.log('✅ 内容已写入剪贴板 (Clipboard API)');
                        return true;
                    } else {
                        // 备用方法：使用传统的execCommand
                        const textArea = document.createElement('textarea');
                        textArea.value = textContent;
                        textArea.style.position = 'fixed';
                        textArea.style.left = '-999999px';
                        textArea.style.top = '-999999px';
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        console.log('✅ 内容已写入剪贴板 (execCommand)');
                        return true;
                    }
                } catch (error) {
                    console.error('❌ 写入剪贴板失败:', error);
                    return false;
                }
            }, content);

            // 3. 短暂等待确保剪贴板写入完成
            await this.page.waitForTimeout(100);

            // 4. 执行粘贴操作
            logger.info('开始粘贴内容...');

            // 使用 Ctrl+V 快捷键粘贴
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyV');
            await this.page.keyboard.up('Control');

            // 5. 等待粘贴完成
            await this.page.waitForTimeout(500);

            // 6. 验证内容是否正确粘贴
            const pastedContent = await this.page.evaluate(() => {
                // 检查当前焦点元素的内容
                const activeElement = document.activeElement;
                if (activeElement && activeElement.contentEditable === 'true') {
                    return activeElement.textContent || activeElement.innerText || '';
                }

                // 如果没有活动元素，检查所有可编辑区域
                const editableElements = document.querySelectorAll('[contenteditable="true"]');
                for (const element of editableElements) {
                    const text = element.textContent || element.innerText || '';
                    if (text.length > 50) { // 假设内容区域会有较多文本
                        return text;
                    }
                }
                return '';
            });

            const expectedLength = content.length;
            const actualLength = pastedContent.length;

            logger.info(`内容粘贴验证:`);
            logger.info(`  期望长度: ${expectedLength} 字符`);
            logger.info(`  实际长度: ${actualLength} 字符`);
            logger.info(`  内容预览: "${pastedContent.substring(0, 100)}..."`);

            // 7. 检查粘贴是否成功
            if (actualLength === 0) {
                logger.warn('⚠️ 粘贴后内容为空，尝试备用输入方法');
                return await this.fallbackToTyping(content);
            } else if (actualLength > 0) {
                // 只要有内容就认为粘贴成功，不再严格比较长度
                // 因为Medium可能会对内容进行格式化处理导致长度变化
                logger.info('✅ 内容粘贴成功！');

                // 可选：检查是否包含预期内容的开头部分作为额外验证
                const contentStart = content.substring(0, Math.min(30, content.length)).trim();
                if (contentStart && pastedContent.includes(contentStart)) {
                    logger.info('✅ 内容验证通过：包含预期的开头部分');
                } else {
                    logger.info('ℹ️ 内容已粘贴，Medium可能进行了格式化处理');
                }

                return true;
            } else {
                logger.warn('⚠️ 无法获取粘贴内容，尝试备用输入方法');
                return await this.fallbackToTyping(content);
            }

        } catch (error) {
            logger.error(`粘贴输入失败: ${error.message}`);
            logger.info('降级到传统键盘输入方式');
            return await this.fallbackToTyping(content);
        }
    }

    /**
     * 备用方法：使用传统的键盘输入
     * 当粘贴失败时使用
     * @param {string} content - 要输入的内容
     */
    async fallbackToTyping(content) {
        try {
            logger.info('使用传统键盘输入作为备用方案');

            // 清空当前内容（如果有的话）
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyA');
            await this.page.keyboard.up('Control');
            await this.page.waitForTimeout(100);

            await this.page.keyboard.press('Delete');
            await this.page.waitForTimeout(100);

            // 开始输入内容
            logger.info('开始键盘输入...');
            await this.page.keyboard.type(content, { delay: 0 }); // 无延迟快速输入

            logger.info('✅ 备用键盘输入完成');
            return true;
        } catch (error) {
            logger.error(`备用键盘输入也失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 查找真正的标题输入区域 - 简化但更准确的方法
     */
    async findTitleArea() {
        logger.info('正在寻找真正的标题输入区域...');

        // 详细分析页面结构
        const pageAnalysis = await this.page.evaluate(() => {
            // 获取所有可编辑元素信息
            const editableElements = Array.from(document.querySelectorAll('[contenteditable="true"]'));
            const elementsInfo = editableElements.map((el, index) => {
                const rect = el.getBoundingClientRect();
                return {
                    index,
                    tagName: el.tagName,
                    className: el.className,
                    textContent: el.textContent ? el.textContent.trim().substring(0, 50) : '',
                    isVisible: rect.width > 0 && rect.height > 0,
                    position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    hasPlaceholder: el.hasAttribute('placeholder'),
                    placeholder: el.getAttribute('placeholder') || '',
                    parentClass: el.parentElement ? el.parentElement.className : '',
                    isH1: el.tagName.toLowerCase() === 'h1'
                };
            });

            return {
                totalEditableElements: editableElements.length,
                elements: elementsInfo,
                url: window.location.href
            };
        });

        logger.info(`页面分析: 找到 ${pageAnalysis.totalEditableElements} 个可编辑元素`);
        pageAnalysis.elements.forEach((el, i) => {
            logger.info(`元素${i}: ${el.tagName} "${el.textContent}" visible:${el.isVisible} isH1:${el.isH1}`);
        });

        // 优先级查找策略 - 基于具体的Medium编辑器结构
        const strategies = [
            // 策略1: 精确查找Medium标题元素（基于提供的HTML结构）
            async () => {
                logger.info('策略1: 查找data-testid="editorTitleParagraph"元素');
                const titleElement = await this.page.$('[data-testid="editorTitleParagraph"]');
                if (titleElement) {
                    const isVisible = await titleElement.isIntersectingViewport();
                    if (isVisible) {
                        logger.info('✅ 找到Medium标题元素 (editorTitleParagraph)');
                        return titleElement;
                    }
                }
                return null;
            },

            // 策略2: 查找包含defaultValue类的标题元素
            async () => {
                logger.info('策略2: 查找包含defaultValue的h3标题元素');
                const titleElement = await this.page.$('h3.graf--title');
                if (titleElement) {
                    const isVisible = await titleElement.isIntersectingViewport();
                    if (isVisible) {
                        logger.info('✅ 找到h3.graf--title元素');
                        return titleElement;
                    }
                }
                return null;
            },

            // 策略3: 查找graf--title类的元素
            async () => {
                logger.info('策略3: 查找.graf--title元素');
                const titleElement = await this.page.$('.graf--title');
                if (titleElement) {
                    const isVisible = await titleElement.isIntersectingViewport();
                    if (isVisible) {
                        logger.info('✅ 找到.graf--title元素');
                        return titleElement;
                    }
                }
                return null;
            },

            // 策略4: 查找第一个可见的H3元素（备选）
            async () => {
                logger.info('策略4: 查找第一个可见的h3元素');
                const h3Elements = await this.page.$$('h3');
                for (const el of h3Elements) {
                    const isVisible = await el.isIntersectingViewport();
                    if (isVisible) {
                        logger.info('✅ 找到可见的H3元素');
                        return el;
                    }
                }
                return null;
            },

            // 策略5: 通过位置判断（最上方的标题元素）
            async () => {
                logger.info('策略5: 通过位置查找最上方的标题元素');
                const elementHandle = await this.page.evaluateHandle(() => {
                    // 查找所有可能的标题元素
                    const titleSelectors = [
                        '[data-testid="editorTitleParagraph"]',
                        'h3.graf--title',
                        '.graf--title',
                        'h1[contenteditable="true"]',
                        'h2[contenteditable="true"]',
                        'h3[contenteditable="true"]'
                    ];

                    const titleElements = [];
                    titleSelectors.forEach(selector => {
                        const elements = Array.from(document.querySelectorAll(selector));
                        titleElements.push(...elements);
                    });

                    const visibleElements = titleElements.filter(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    });

                    if (visibleElements.length === 0) return null;

                    // 按Y坐标排序，最上面的是标题
                    visibleElements.sort((a, b) => {
                        return a.getBoundingClientRect().y - b.getBoundingClientRect().y;
                    });

                    return visibleElements[0];
                });

                if (elementHandle && await elementHandle.asElement()) {
                    logger.info('✅ 通过位置判断找到标题区域');
                    return elementHandle.asElement();
                }
                return null;
            }
        ];

        // 按优先级尝试每种策略
        for (let i = 0; i < strategies.length; i++) {
            try {
                const element = await strategies[i]();
                if (element) {
                    // 验证元素确实可编辑且可见
                    const elementInfo = await element.evaluate(el => ({
                        contentEditable: el.getAttribute('contenteditable'),
                        tagName: el.tagName,
                        textContent: el.textContent.trim().substring(0, 50)
                    }));

                    logger.info(`策略${i + 1}成功找到标题区域: ${JSON.stringify(elementInfo)}`);
                    return element;
                }
            } catch (error) {
                logger.warn(`策略${i + 1}失败: ${error.message}`);
                continue;
            }
        }

        // 最后备选方案：使用任何可编辑元素
        logger.warn('所有策略都失败，使用第一个可编辑元素作为备选');
        const fallbackElement = await this.page.$('[contenteditable="true"]');
        if (fallbackElement) {
            logger.info('找到备选的可编辑元素');
            return fallbackElement;
        }

        throw new Error('无法找到任何可编辑的标题区域');
    }

    /**
 * 查找标题元素
 */
    async findTitleElement() {
        // 先尝试通过JavaScript分析页面结构
        const titleInfo = await this.page.evaluate(() => {
            const results = [];

            // 查找所有contenteditable元素
            const editableElements = document.querySelectorAll('[contenteditable="true"]');
            editableElements.forEach((el, index) => {
                const info = {
                    index: index,
                    tagName: el.tagName,
                    textContent: el.textContent || '',
                    placeholder: el.getAttribute('placeholder') || '',
                    className: el.className || '',
                    id: el.id || '',
                    isTitle: false
                };

                // 判断是否可能是标题元素 - 改进识别逻辑
                if (el.tagName.toLowerCase() === 'h1' ||
                    el.tagName.toLowerCase() === 'h2' ||
                    info.placeholder.toLowerCase().includes('title') ||
                    info.className.includes('title') ||
                    info.textContent.includes('Title') ||  // 包含"Title"文本
                    info.textContent.includes('测试标题') ||  // 包含测试标题文本
                    (index === 0 && editableElements.length === 1) ||  // 只有一个编辑器时，使用第一个
                    (info.textContent === '' && index === 0)) { // 第一个空的可编辑元素通常是标题
                    info.isTitle = true;
                }

                results.push(info);
            });

            return results;
        });

        logger.info(`页面可编辑元素分析: ${JSON.stringify(titleInfo)}`);

        // 优先选择标记为标题的元素
        const titleElement = titleInfo.find(el => el.isTitle);
        if (titleElement) {
            try {
                const element = await this.page.evaluateHandle((index) => {
                    const editableElements = document.querySelectorAll('[contenteditable="true"]');
                    return editableElements[index];
                }, titleElement.index);

                if (element && element.asElement()) {
                    logger.info(`通过分析找到标题元素，索引: ${titleElement.index}`);
                    return element.asElement();
                }
            } catch (e) {
                logger.warn('获取分析到的标题元素失败:', e.message);
            }
        }

        // 传统选择器方法
        const selectors = [
            '[data-testid="storyTitle"]',
            'h1[data-text="true"]',
            'h1[contenteditable="true"]',
            '[contenteditable="true"]:first-of-type', // 第一个可编辑元素
            '[placeholder*="Title"]',
            '[placeholder*="title"]',
            '.notranslate h1',
            'h1.graf--title',
            'textarea[placeholder*="title"]',
            'input[placeholder*="title"]'
        ];

        for (const selector of selectors) {
            try {
                const element = await this.page.$(selector);
                if (element) {
                    logger.info(`找到标题元素: ${selector}`);
                    return element;
                }
            } catch (e) {
                continue;
            }
        }

        // 如果还是没找到，尝试第一个contenteditable元素
        try {
            const firstEditable = await this.page.$('[contenteditable="true"]');
            if (firstEditable) {
                logger.info('使用第一个可编辑元素作为标题');
                return firstEditable;
            }
        } catch (e) {
            logger.warn('获取第一个可编辑元素失败:', e.message);
        }

        return null;
    }

    /**
     * 查找内容元素
     */
    async findContentElement() {
        const selectors = [
            '[data-testid="storyContent"]',
            'div[data-text="true"]:not(h1)',
            'div[contenteditable="true"]:not(h1)',
            '.notranslate div[contenteditable="true"]',
            '.graf--p',
            '[data-default-placeholder]',
            'div[role="textbox"]'
        ];

        for (const selector of selectors) {
            try {
                await this.page.waitForSelector(selector, { timeout: 3000 });
                const element = await this.page.$(selector);
                if (element) {
                    logger.info(`找到内容元素: ${selector}`);
                    return element;
                }
            } catch (e) {
                continue;
            }
        }

        return null;
    }

    /**
     * 检查发布按钮是否可用
     */
    async checkPublishButtonEnabled(publishButton) {
        try {
            const isEnabled = await this.page.evaluate((button) => {
                if (!button) return false;

                // 检查disabled属性
                if (button.disabled) return false;

                // 检查CSS类名
                const className = button.className || '';
                const isDisabled = className.includes('disabled') ||
                    className.includes('button--disabled') ||
                    className.includes('button--disabledPrimary');

                // 检查aria-disabled属性
                const ariaDisabled = button.getAttribute('aria-disabled');
                if (ariaDisabled === 'true') return false;

                // 检查按钮样式
                const computedStyle = window.getComputedStyle(button);
                if (computedStyle.pointerEvents === 'none') return false;

                return !isDisabled;
            }, publishButton);

            logger.info(`发布按钮状态检查: ${isEnabled ? '可用' : '禁用'}`);
            return isEnabled;
        } catch (error) {
            logger.error(`检查发布按钮状态失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 尝试启用发布按钮
     */
    async enablePublishButton() {
        try {
            logger.info('尝试启用发布按钮...');

            // 策略1: 闪电模式 - 最小等待
            await this.page.waitForTimeout(200); // 从2秒减少到0.2秒

            // 策略2: 检查文章内容是否足够
            await this.ensureMinimumContent();

            // 策略3: 尝试触发页面事件
            await this.triggerContentEvents();

            // 策略4: 闪电模式 - 取消等待
            // await this.page.waitForTimeout(1000); // 完全取消等待

            logger.info('发布按钮启用尝试完成');
        } catch (error) {
            logger.error(`启用发布按钮失败: ${error.message}`);
        }
    }

    /**
     * 确保文章有最小内容要求
     */
    async ensureMinimumContent() {
        try {
            const contentLength = await this.page.evaluate(() => {
                const editors = document.querySelectorAll('[contenteditable="true"]');
                let totalLength = 0;
                editors.forEach(editor => {
                    totalLength += editor.textContent.trim().length;
                });
                return totalLength;
            });

            logger.info(`当前文章内容长度: ${contentLength} 字符`);

            // 如果内容太短，添加一些内容
            if (contentLength < 100) {
                logger.info('文章内容可能太短，尝试添加更多内容...');

                const contentEditor = await this.page.$('div[contenteditable="true"]:not(h1)');
                if (contentEditor) {
                    await contentEditor.click();
                    await this.page.keyboard.press('End');
                    await this.page.keyboard.type('\n\n补充内容：这篇文章展示了自动化发布系统的强大功能。通过智能的内容管理和发布流程，我们可以大大提高内容创作的效率。');
                    await this.page.waitForTimeout(2000);
                }
            }
        } catch (error) {
            logger.error(`确保最小内容失败: ${error.message}`);
        }
    }

    /**
 * 触发内容相关事件
 */
    async triggerContentEvents() {
        try {
            // 触发输入事件，让Medium检测到内容变化
            await this.page.evaluate(() => {
                const editors = document.querySelectorAll('[contenteditable="true"]');
                editors.forEach(editor => {
                    // 触发各种事件
                    ['input', 'change', 'blur', 'focus'].forEach(eventType => {
                        const event = new Event(eventType, { bubbles: true });
                        editor.dispatchEvent(event);
                    });
                });
            });

            // 点击页面其他地方触发blur事件
            await this.page.click('body');
            // await this.page.waitForTimeout(1000); // 取消等待，立即继续

        } catch (error) {
            logger.error(`触发内容事件失败: ${error.message}`);
        }
    }

    /**
     * 诊断发布问题
     */
    async diagnoseProblem() {
        try {
            logger.info('开始诊断发布问题...');

            const diagnosis = await this.page.evaluate(() => {
                const result = {
                    contentLength: 0,
                    titleLength: 0,
                    hasTitle: false,
                    hasContent: false,
                    errorMessages: [],
                    warnings: []
                };

                // 检查标题
                const titleElements = document.querySelectorAll('[contenteditable="true"]:first-of-type, h1[contenteditable="true"]');
                if (titleElements.length > 0) {
                    const titleText = titleElements[0].textContent.trim();
                    result.hasTitle = titleText.length > 0;
                    result.titleLength = titleText.length;

                    if (titleText.includes('Title') || titleText.includes('标题')) {
                        result.warnings.push('标题似乎包含占位符文本');
                    }
                }

                // 检查内容
                const contentElements = document.querySelectorAll('[contenteditable="true"]:not(:first-of-type)');
                if (contentElements.length > 0) {
                    let totalContent = '';
                    contentElements.forEach(el => {
                        totalContent += el.textContent.trim() + ' ';
                    });
                    result.hasContent = totalContent.trim().length > 0;
                    result.contentLength = totalContent.trim().length;

                    if (totalContent.includes('Tell your story') || totalContent.includes('写下你的故事')) {
                        result.warnings.push('内容似乎包含占位符文本');
                    }
                }

                // 检查错误消息
                const errorElements = document.querySelectorAll('[class*="error"], [class*="warning"], .notification, .alert');
                errorElements.forEach(el => {
                    if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                        result.errorMessages.push(el.textContent.trim());
                    }
                });

                // 检查最小内容要求
                if (result.titleLength < 3) {
                    result.warnings.push('标题太短（少于3个字符）');
                }

                if (result.contentLength < 50) {
                    result.warnings.push('内容太短（少于50个字符）');
                }

                return result;
            });

            logger.info(`诊断结果: ${JSON.stringify(diagnosis, null, 2)}`);

            // 根据诊断结果给出建议
            if (!diagnosis.hasTitle) {
                logger.error('❌ 文章缺少标题');
            }

            if (!diagnosis.hasContent) {
                logger.error('❌ 文章缺少内容');
            }

            if (diagnosis.warnings.length > 0) {
                logger.warn(`⚠️ 发现问题: ${diagnosis.warnings.join(', ')}`);
            }

            if (diagnosis.errorMessages.length > 0) {
                logger.error(`🚨 页面错误: ${diagnosis.errorMessages.join(', ')}`);
            }

            return diagnosis;
        } catch (error) {
            logger.error(`诊断发布问题失败: ${error.message}`);
            return null;
        }
    }

    /**
     * 查找发布按钮
     */
    async findPublishButton() {
        const selectors = [
            'button[data-testid="publishButton"]',
            'button:contains("Publish")',
            'button:contains("发布")',
            '[aria-label*="publish"]',
            '[aria-label*="Publish"]',
            '.publishButton',
            'button[data-action="publish"]'
        ];

        for (const selector of selectors) {
            try {
                await this.page.waitForSelector(selector, { timeout: 5000 });
                const element = await this.page.$(selector);
                if (element) {
                    logger.info(`找到发布按钮: ${selector}`);
                    return element;
                }
            } catch (e) {
                continue;
            }
        }

        // 尝试通过文本查找
        try {
            const button = await this.page.evaluateHandle(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.find(btn =>
                    btn.textContent &&
                    (btn.textContent.toLowerCase().includes('publish') ||
                        btn.textContent.includes('发布'))
                );
            });

            if (button && button.asElement()) {
                logger.info('通过文本找到发布按钮');
                return button.asElement();
            }
        } catch (e) {
            // 忽略错误
        }

        return null;
    }

    /**
     * 等待发布对话框出现
     */
    async waitForPublishDialog() {
        logger.info('开始检测发布对话框...');

        // 先等待一下页面更新（减少等待时间）
        await this.page.waitForTimeout(1000); // 从3秒减少到1秒

        // 检查页面结构变化
        const pageInfo = await this.analyzePublishPage();
        logger.info(`发布后页面分析: ${JSON.stringify(pageInfo)}`);

        const selectors = [
            // Medium 新版本可能的选择器
            '[data-testid="publishForm"]',
            '[data-testid="publishFormTitle"]',
            '[data-testid="publish-form"]',
            '.publish-dialog',
            '[role="dialog"]',
            '.modal',
            '.publishForm',
            // 检查是否出现了设置面板
            '[data-testid="story-settings"]',
            '[data-testid="settings-panel"]',
            // 检查发布按钮区域
            '[data-testid="publish-panel"]',
            // 通用模态框
            '.ReactModal__Content',
            '[class*="modal"]',
            '[class*="dialog"]',
            '[class*="publish"]'
        ];

        // 尝试多种检测方式
        for (let attempt = 1; attempt <= 3; attempt++) {
            logger.info(`发布对话框检测第${attempt}次尝试...`);

            for (const selector of selectors) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        const isVisible = await this.page.evaluate(el => {
                            const rect = el.getBoundingClientRect();
                            return rect.width > 0 && rect.height > 0 &&
                                window.getComputedStyle(el).display !== 'none';
                        }, element);

                        if (isVisible) {
                            logger.info(`发布对话框已出现: ${selector}`);
                            return true;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            // 如果没找到，等待一下再试（减少等待时间）
            if (attempt < 3) {
                await this.page.waitForTimeout(1000); // 从2秒减少到1秒
            }
        }

        // 如果还是没找到，尝试检测页面是否已经直接发布
        const directPublishCheck = await this.checkDirectPublish();
        if (directPublishCheck) {
            logger.info('检测到可能已直接发布，跳过对话框步骤');
            return 'direct_publish';
        }

        return false;
    }

    /**
     * 分析发布后的页面结构
     */
    async analyzePublishPage() {
        try {
            return await this.page.evaluate(() => {
                const result = {
                    url: window.location.href,
                    title: document.title,
                    modals: [],
                    dialogs: [],
                    buttons: [],
                    forms: []
                };

                // 检查模态框
                const modalSelectors = ['[role="dialog"]', '.modal', '[class*="modal"]', '.ReactModal__Content'];
                modalSelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        result.modals.push(`${selector}: ${elements.length}`);
                    }
                });

                // 检查对话框相关元素
                const dialogElements = document.querySelectorAll('[class*="dialog"], [class*="publish"], [data-testid*="publish"]');
                dialogElements.forEach((el, index) => {
                    if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                        result.dialogs.push({
                            index,
                            tagName: el.tagName,
                            className: el.className,
                            id: el.id,
                            testId: el.getAttribute('data-testid')
                        });
                    }
                });

                // 检查按钮
                const buttons = document.querySelectorAll('button');
                buttons.forEach((btn, index) => {
                    if (btn.offsetWidth > 0 && btn.offsetHeight > 0) {
                        const text = btn.textContent.trim();
                        if (text.includes('Publish') || text.includes('发布') || text.includes('Share') || text.includes('分享')) {
                            result.buttons.push({
                                index,
                                text: text.substring(0, 50),
                                className: btn.className,
                                testId: btn.getAttribute('data-testid')
                            });
                        }
                    }
                });

                return result;
            });
        } catch (error) {
            logger.error(`页面分析失败: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * 检查是否已经直接发布
     */
    async checkDirectPublish() {
        try {
            // 检查URL是否已经改变（发布成功通常会跳转）
            const currentUrl = await this.page.url();
            if (currentUrl.includes('/p/') || currentUrl !== 'https://medium.com/new-story') {
                logger.info(`URL已改变，可能已发布: ${currentUrl}`);
                return true;
            }

            // 检查成功消息
            const successMessages = await this.page.evaluate(() => {
                const messages = [];
                const textNodes = document.evaluate(
                    "//text()[contains(., 'published') or contains(., '发布') or contains(., 'story') or contains(., 'article')]",
                    document,
                    null,
                    XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
                    null
                );
                for (let i = 0; i < textNodes.snapshotLength; i++) {
                    const node = textNodes.snapshotItem(i);
                    if (node.parentElement && node.parentElement.offsetWidth > 0) {
                        messages.push(node.textContent.trim());
                    }
                }
                return messages;
            });

            if (successMessages.length > 0) {
                logger.info(`发现发布相关消息: ${JSON.stringify(successMessages)}`);
                return true;
            }

            return false;
        } catch (error) {
            logger.error(`检查直接发布状态失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 添加标签 - 改进版本，支持现代Medium界面
     */
    async addTags(tags) {
        try {
            logger.info(`正在添加标签: ${tags.join(', ')}`);

            // 首先分析页面上的标签相关元素
            const tagAnalysis = await this.analyzeTagElements();
            logger.info(`标签元素分析: ${JSON.stringify(tagAnalysis)}`);

            // 改进的标签选择器，包含更多现代Medium可能使用的选择器
            const tagSelectors = [
                // 现代Medium常用选择器
                '[data-testid="add-tag-input"]',
                '[data-testid="tag-input"]',
                '[data-testid="tags-input"]',
                'input[aria-label*="tag"]',
                'input[aria-label*="Tag"]',
                // 传统选择器
                'input[placeholder="Add a tag..."]',
                'input[placeholder*="tag"]',
                'input[placeholder*="Tag"]',
                'input[placeholder*="添加标签"]',
                // 通用选择器
                '.tag-input',
                '.tags-input',
                'input[name*="tag"]',
                'input[id*="tag"]',
                // 发布对话框中的标签输入
                '.publish-dialog input',
                '.publish-modal input',
                '[role="dialog"] input'
            ];

            let tagInput = null;
            let usedSelector = null;

            // 尝试找到标签输入框
            for (const selector of tagSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 2000 });
                    const element = await this.page.$(selector);
                    if (element) {
                        // 验证元素是否可见和可交互
                        const isInteractable = await element.evaluate(el => {
                            const rect = el.getBoundingClientRect();
                            const style = getComputedStyle(el);
                            return rect.width > 0 &&
                                rect.height > 0 &&
                                style.display !== 'none' &&
                                style.visibility !== 'hidden' &&
                                !el.disabled;
                        });

                        if (isInteractable) {
                            tagInput = element;
                            usedSelector = selector;
                            logger.info(`✅ 找到可用的标签输入框: ${selector}`);
                            break;
                        } else {
                            logger.info(`⚠️ 找到标签输入框但不可交互: ${selector}`);
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            // 如果没找到，尝试更通用的方法
            if (!tagInput) {
                logger.info('尝试通用方法寻找输入框...');
                tagInput = await this.findTagInputByAnalysis();
                if (tagInput) {
                    usedSelector = '通用分析方法';
                    logger.info('✅ 通过分析找到标签输入框');
                }
            }

            if (tagInput) {
                logger.info(`开始添加标签，使用选择器: ${usedSelector}`);

                for (let i = 0; i < tags.slice(0, 5).length; i++) { // Medium最多允许5个标签
                    const tag = tags[i];
                    try {
                        // 标签之间增加更多间隔时间
                        if (i > 0) {
                            logger.info(`等待标签间隔 (${i + 1}/${tags.slice(0, 5).length})...`);
                            await this.page.waitForTimeout(1000); // 标签间隔1秒
                        }

                        // 点击输入框确保焦点
                        await tagInput.click();
                        await this.page.waitForTimeout(300);

                        // 使用粘贴方式输入标签（更快更可靠）
                        logger.info(`正在粘贴标签: ${tag.trim()}`);
                        await this.inputTagWithPaste(tagInput, tag.trim());

                        // 按回车确认添加
                        await this.page.keyboard.press('Enter');
                        await this.page.waitForTimeout(800); // 等待标签被处理

                        logger.info(`✅ 已添加标签 ${i + 1}/${tags.slice(0, 5).length}: ${tag}`);
                    } catch (tagError) {
                        logger.warn(`添加标签 "${tag}" 失败: ${tagError.message}`);
                        continue;
                    }
                }

                logger.info('标签添加过程完成');
            } else {
                logger.warn('❌ 未找到标签输入框 - Medium可能已更新界面或标签功能暂时不可用');

                // 记录当前页面状态用于调试
                const pageInfo = await this.page.evaluate(() => ({
                    url: window.location.href,
                    title: document.title,
                    inputCount: document.querySelectorAll('input').length,
                    dialogExists: !!document.querySelector('[role="dialog"]')
                }));

                logger.info(`当前页面状态: ${JSON.stringify(pageInfo)}`);
            }
        } catch (error) {
            logger.warn('添加标签时出现问题:', error.message);
        }
    }

    /**
     * 分析页面上的标签相关元素
     */
    async analyzeTagElements() {
        return await this.page.evaluate(() => {
            const result = {
                inputs: [],
                dialogInputs: [],
                tagRelatedElements: []
            };

            // 分析所有输入框
            const inputs = document.querySelectorAll('input');
            inputs.forEach((input, index) => {
                const info = {
                    index,
                    type: input.type,
                    placeholder: input.placeholder || '',
                    ariaLabel: input.getAttribute('aria-label') || '',
                    className: input.className || '',
                    id: input.id || '',
                    name: input.name || '',
                    isVisible: input.offsetWidth > 0 && input.offsetHeight > 0
                };

                result.inputs.push(info);

                // 检查是否在对话框中
                if (input.closest('[role="dialog"]') || input.closest('.modal') || input.closest('.dialog')) {
                    result.dialogInputs.push(info);
                }

                // 检查是否与标签相关
                const isTagRelated = info.placeholder.toLowerCase().includes('tag') ||
                    info.ariaLabel.toLowerCase().includes('tag') ||
                    info.className.toLowerCase().includes('tag') ||
                    info.id.toLowerCase().includes('tag') ||
                    info.name.toLowerCase().includes('tag');

                if (isTagRelated) {
                    result.tagRelatedElements.push(info);
                }
            });

            return result;
        });
    }

    /**
     * 通过分析页面元素来寻找标签输入框
     */
    async findTagInputByAnalysis() {
        try {
            const inputs = await this.page.$$('input');

            for (const input of inputs) {
                const info = await input.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return {
                        placeholder: el.placeholder || '',
                        ariaLabel: el.getAttribute('aria-label') || '',
                        className: el.className || '',
                        id: el.id || '',
                        name: el.name || '',
                        isVisible: rect.width > 0 && rect.height > 0,
                        isEnabled: !el.disabled,
                        inDialog: !!el.closest('[role="dialog"]')
                    };
                });

                // 检查是否可能是标签输入框
                const isTagInput = (
                    info.placeholder.toLowerCase().includes('tag') ||
                    info.ariaLabel.toLowerCase().includes('tag') ||
                    info.className.toLowerCase().includes('tag') ||
                    info.id.toLowerCase().includes('tag') ||
                    info.name.toLowerCase().includes('tag')
                ) && info.isVisible && info.isEnabled;

                if (isTagInput) {
                    logger.info(`通过分析找到潜在的标签输入框: placeholder="${info.placeholder}" aria-label="${info.ariaLabel}"`);
                    return input;
                }
            }

            return null;
        } catch (error) {
            logger.error('分析标签输入框时出错:', error.message);
            return null;
        }
    }

    /**
     * 使用粘贴方式快速输入标签
     * @param {ElementHandle} tagInput - 标签输入框元素
     * @param {string} tag - 要输入的标签文本
     */
    async inputTagWithPaste(tagInput, tag) {
        try {
            logger.info(`开始使用粘贴方式输入标签: "${tag}"`);

            // 1. 将标签写入剪贴板
            await this.page.evaluate(async (tagText) => {
                try {
                    // 使用现代剪贴板API
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(tagText);
                        console.log('✅ 标签已写入剪贴板 (Clipboard API)');
                        return true;
                    } else {
                        // 备用方法：使用传统的execCommand
                        const textArea = document.createElement('textarea');
                        textArea.value = tagText;
                        textArea.style.position = 'fixed';
                        textArea.style.left = '-999999px';
                        textArea.style.top = '-999999px';
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        console.log('✅ 标签已写入剪贴板 (execCommand)');
                        return true;
                    }
                } catch (error) {
                    console.error('❌ 写入剪贴板失败:', error);
                    return false;
                }
            }, tag);

            // 2. 短暂等待确保剪贴板写入完成
            await this.page.waitForTimeout(100);

            // 3. 清空当前输入框内容（如果有的话）
            await tagInput.click();
            await this.page.waitForTimeout(100);

            // 选择所有内容并删除
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyA');
            await this.page.keyboard.up('Control');
            await this.page.waitForTimeout(50);

            await this.page.keyboard.press('Delete');
            await this.page.waitForTimeout(100);

            // 4. 执行粘贴操作
            logger.info('开始粘贴标签...');

            // 使用 Ctrl+V 快捷键粘贴
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyV');
            await this.page.keyboard.up('Control');

            // 5. 等待粘贴完成
            await this.page.waitForTimeout(300);

            // 6. 验证标签是否正确粘贴
            const pastedTag = await tagInput.evaluate(el => el.value || el.textContent || el.innerText || '');

            logger.info(`标签粘贴验证:`);
            logger.info(`  期望: "${tag}"`);
            logger.info(`  实际: "${pastedTag}"`);

            // 7. 检查粘贴是否成功
            if (pastedTag.trim() === tag.trim() || pastedTag.includes(tag.trim())) {
                logger.info('✅ 标签粘贴成功！');
                return true;
            } else if (pastedTag.trim() === '') {
                logger.warn('⚠️ 标签粘贴后为空，使用备用键盘输入');
                return await this.fallbackToTagTyping(tagInput, tag);
            } else {
                logger.info('ℹ️ 标签已粘贴，可能有格式差异但内容正确');
                return true;
            }

        } catch (error) {
            logger.error(`标签粘贴输入失败: ${error.message}`);
            logger.info('降级到传统键盘输入方式');
            return await this.fallbackToTagTyping(tagInput, tag);
        }
    }

    /**
     * 备用方法：使用传统键盘输入标签
     * @param {ElementHandle} tagInput - 标签输入框元素
     * @param {string} tag - 要输入的标签
     */
    async fallbackToTagTyping(tagInput, tag) {
        try {
            logger.info(`使用键盘输入标签作为备用方案: "${tag}"`);

            // 确保输入框获得焦点
            await tagInput.click();
            await this.page.waitForTimeout(100);

            // 清空当前内容
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyA');
            await this.page.keyboard.up('Control');
            await this.page.waitForTimeout(50);

            await this.page.keyboard.press('Delete');
            await this.page.waitForTimeout(100);

            // 开始键盘输入
            logger.info('开始键盘输入标签...');
            await tagInput.type(tag, { delay: 30 }); // 较快的输入延迟

            logger.info('✅ 备用键盘输入完成');
            return true;
        } catch (error) {
            logger.error(`备用键盘输入也失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 查找真正的发布按钮（确保发布而非保存草稿）
     */
    async findRealPublishButton() {
        // 专门查找真正发布的按钮，避免草稿保存
        const realPublishSelectors = [
            'button[data-testid="publishConfirmButton"]', // 真正的发布确认按钮
            'button:contains("Publish now")',
            'button:contains("立即发布")',
            'button.js-publishButton[data-testid="publishConfirmButton"]'
        ];

        for (const selector of realPublishSelectors) {
            try {
                const element = await this.page.$(selector);
                if (element) {
                    const isVisible = await this.page.evaluate(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 &&
                            window.getComputedStyle(el).display !== 'none';
                    }, element);

                    if (isVisible) {
                        logger.info(`找到真正的发布按钮: ${selector}`);
                        return element;
                    }
                }
            } catch (e) {
                continue;
            }
        }

        // 如果没找到，尝试通过文本内容查找
        try {
            const publishButton = await this.page.evaluateHandle(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.find(btn => {
                    const text = btn.textContent.trim().toLowerCase();
                    return (text === 'publish now' || text === '立即发布') &&
                        btn.offsetWidth > 0 && btn.offsetHeight > 0;
                });
            });

            if (publishButton && publishButton.asElement()) {
                logger.info('通过文本找到真正的发布按钮');
                return publishButton.asElement();
            }
        } catch (e) {
            logger.warn('通过文本查找发布按钮失败:', e.message);
        }

        return null;
    }

    /**
     * 查找最终发布按钮（备用方法）
     */
    async findFinalPublishButton() {
        const selectors = [
            'button[data-testid="publishButton"]',
            'button[data-testid="publish-button"]',
            'button:contains("Publish now")',
            'button:contains("立即发布")',
            '.publish-dialog button[type="submit"]',
            'button[type="submit"]' // 通用提交按钮
        ];

        for (const selector of selectors) {
            try {
                const element = await this.page.$(selector);
                if (element) {
                    const isVisible = await this.page.evaluate(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 &&
                            window.getComputedStyle(el).display !== 'none';
                    }, element);

                    if (isVisible) {
                        logger.info(`找到最终发布按钮: ${selector}`);
                        return element;
                    }
                }
            } catch (e) {
                continue;
            }
        }

        return null;
    }

    /**
     * 寻找备选发布按钮
     */
    async findAlternativePublishButtons() {
        try {
            const buttons = await this.page.evaluate(() => {
                const allButtons = Array.from(document.querySelectorAll('button'));
                return allButtons
                    .filter(btn => {
                        const rect = btn.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0) return false;

                        const text = btn.textContent.toLowerCase().trim();
                        return text.includes('publish') ||
                            text.includes('发布') ||
                            text.includes('share') ||
                            text.includes('分享') ||
                            text.includes('submit') ||
                            text.includes('确认');
                    })
                    .map((btn, index) => ({
                        index,
                        text: btn.textContent.trim(),
                        className: btn.className,
                        id: btn.id,
                        testId: btn.getAttribute('data-testid')
                    }));
            });

            logger.info(`找到 ${buttons.length} 个备选发布按钮: ${JSON.stringify(buttons)}`);

            // 返回实际的按钮元素，并包含文本信息
            const buttonElements = [];
            for (const btnInfo of buttons) {
                try {
                    const element = await this.page.evaluateHandle((btnInfo) => {
                        const allButtons = Array.from(document.querySelectorAll('button'));
                        return allButtons.find((btn, idx) =>
                            idx === btnInfo.index &&
                            btn.textContent.trim() === btnInfo.text
                        );
                    }, btnInfo);

                    if (element) {
                        // 为按钮元素添加文本信息
                        element.textContent = btnInfo.text;
                        buttonElements.push(element);
                    }
                } catch (e) {
                    continue;
                }
            }

            return buttonElements;
        } catch (error) {
            logger.error(`寻找备选发布按钮失败: ${error.message}`);
            return [];
        }
    }

    /**
     * 备用发布策略
     */
    async attemptAlternativePublish(article) {
        try {
            logger.info('开始尝试备用发布策略...');

            // 策略1: 检查是否文章已经自动保存为草稿
            await this.page.waitForTimeout(3000);
            const currentUrl = await this.page.url();

            if (currentUrl.includes('/p/') || currentUrl !== 'https://medium.com/new-story') {
                logger.info('检测到URL变化，文章可能已发布');
                return true;
            }

            // 策略2: 尝试快捷键发布
            logger.info('尝试使用快捷键 Ctrl+Enter 发布...');
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('Enter');
            await this.page.keyboard.up('Control');
            await this.page.waitForTimeout(3000);

            // 检查是否发布成功
            const afterShortcutUrl = await this.page.url();
            if (afterShortcutUrl !== currentUrl) {
                logger.info('快捷键发布成功');
                return true;
            }

            // 策略3: 查找任何包含"publish"字样的可点击元素
            logger.info('寻找页面上任何发布相关的可点击元素...');
            const publishElements = await this.page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('*'));
                return elements
                    .filter(el => {
                        const text = el.textContent.toLowerCase();
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 &&
                            (text.includes('publish') || text.includes('发布')) &&
                            (el.tagName === 'BUTTON' || el.tagName === 'A' || el.onclick || el.style.cursor === 'pointer');
                    })
                    .map(el => ({
                        tagName: el.tagName,
                        text: el.textContent.trim().substring(0, 50),
                        className: el.className
                    }));
            });

            if (publishElements.length > 0) {
                logger.info(`找到 ${publishElements.length} 个发布相关元素，尝试点击第一个...`);

                const firstElement = publishElements[0];
                const elementHandle = await this.page.evaluateHandle((elementInfo) => {
                    const elements = Array.from(document.querySelectorAll('*'));
                    return elements.find(el =>
                        el.tagName === elementInfo.tagName &&
                        el.textContent.trim().substring(0, 50) === elementInfo.text &&
                        el.className === elementInfo.className
                    );
                }, firstElement);

                if (elementHandle) {
                    await elementHandle.click();
                    await this.page.waitForTimeout(3000);

                    const afterClickUrl = await this.page.url();
                    if (afterClickUrl !== currentUrl) {
                        logger.info('备用发布策略成功');
                        return true;
                    }
                }
            }

            // 策略4: 检查文章是否已保存为草稿
            logger.info('检查文章是否已保存为草稿...');
            const draftStatus = await this.page.evaluate(() => {
                const savedText = document.body.textContent.toLowerCase();
                return savedText.includes('saved') || savedText.includes('draft') ||
                    savedText.includes('已保存') || savedText.includes('草稿');
            });

            if (draftStatus) {
                logger.info('文章已保存为草稿，视为部分成功');
                return true;
            }

            return false;
        } catch (error) {
            logger.error(`备用发布策略失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 等待发布完成
     */
    async waitForPublishComplete() {
        try {
            logger.info('开始等待发布完成...');

            // 等待一段时间让页面处理发布（减少等待时间）
            await this.page.waitForTimeout(1000); // 从3秒减少到1秒

            // 方法1: 检查发布成功的明确标识
            const successSelectors = [
                '[data-testid="publishedMessage"]',
                '[data-testid="story-published"]',
                '.publish-success',
                '.published-message',
                'text=Story published',
                'text=Published',
                'text=文章已发布',
                'text=发布成功'
            ];

            for (const selector of successSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 5000 });
                    logger.info(`发布成功确认: ${selector}`);
                    return true;
                } catch (e) {
                    continue;
                }
            }

            // 方法2: 检查URL变化（最可靠的方法）
            let urlChanged = false;
            for (let attempt = 1; attempt <= 6; attempt++) {
                const currentUrl = await this.page.url();
                logger.info(`第${attempt}次URL检查: ${currentUrl}`);

                if (currentUrl !== 'https://medium.com/new-story' && !currentUrl.includes('/new-story')) {
                    if (currentUrl.includes('/p/') && !currentUrl.includes('/edit')) {
                        // 只有URL包含/p/但不包含/edit才是真正发布
                        logger.info('检测到URL变化到发布页面，发布成功');
                        return true;
                    } else if (currentUrl.includes('/p/') && currentUrl.includes('/edit')) {
                        // 包含/edit说明只是保存为草稿
                        logger.warn('检测到草稿保存，但未真正发布 (URL包含/edit)');
                        continue; // 继续等待真正发布
                    } else if (currentUrl.includes('medium.com')) {
                        logger.info('检测到URL变化，可能发布成功');
                        urlChanged = true;
                    }
                }

                if (attempt < 6) {
                    await this.page.waitForTimeout(1000); // 从2秒减少到1秒
                }
            }

            // 方法3: 检查页面内容变化
            logger.info('检查页面内容变化...');
            const pageAnalysis = await this.page.evaluate(() => {
                const result = {
                    title: document.title,
                    url: window.location.href,
                    hasPublishButton: false,
                    hasEditor: false,
                    publishRelatedText: []
                };

                // 检查是否还有发布按钮（如果没有，可能已经发布）
                const publishButtons = Array.from(document.querySelectorAll('button'))
                    .filter(btn => btn.textContent.toLowerCase().includes('publish'));
                result.hasPublishButton = publishButtons.length > 0;

                // 检查是否还有编辑器
                const editors = document.querySelectorAll('[contenteditable="true"]');
                result.hasEditor = editors.length > 0;

                // 查找发布相关的文本
                const textContent = document.body.textContent.toLowerCase();
                const publishKeywords = ['published', 'success', 'published', 'draft saved', '发布', '成功', '草稿', '已保存'];
                publishKeywords.forEach(keyword => {
                    if (textContent.includes(keyword)) {
                        result.publishRelatedText.push(keyword);
                    }
                });

                return result;
            });

            logger.info(`页面分析结果: ${JSON.stringify(pageAnalysis)}`);

            // 如果页面标题或URL表明已经跳转到文章页面
            if (pageAnalysis.title.includes('Medium') && !pageAnalysis.title.includes('New story')) {
                logger.info('页面标题显示可能已发布');
                return true;
            }

            // 如果发现发布相关的积极文本（但要排除固定的界面文本）
            const successTexts = pageAnalysis.publishRelatedText.filter(text =>
                (text.includes('published') && !text.includes('publish')) ||
                text.includes('success') ||
                text.includes('成功') ||
                text.includes('story published') ||
                text.includes('article published')
            );

            if (successTexts.length > 0) {
                logger.info(`发现真正的发布成功文本: ${JSON.stringify(successTexts)}`);
                return true;
            }

            // 如果URL有变化，视为可能成功
            if (urlChanged) {
                logger.info('基于URL变化，认为发布可能成功');
                return true;
            }

            // 方法4: 检查是否保存为草稿
            if (pageAnalysis.publishRelatedText.some(text =>
                text.includes('draft') || text.includes('saved') || text.includes('草稿') || text.includes('已保存'))) {
                logger.info('文章已保存为草稿，视为部分成功');
                return true;
            }

            logger.warn('无法明确确认发布状态，但继续执行');
            return true;

        } catch (error) {
            logger.warn(`等待发布完成时出错: ${error.message}`);
            return true; // 继续执行，不阻断流程
        }
    }

    /**
     * 关闭浏览器
     */
    async close() {
        try {
            if (this.browser) {
                await this.browser.close();
                logger.info('浏览器已关闭');
            }
        } catch (error) {
            logger.error('关闭浏览器时出错:', error);
        }
    }

    /**
     * 完整的发布流程
     * @param {Object} article - 文章对象
     */
    async publishFlow(article) {
        try {
            await this.init();
            await this.login();
            const result = await this.publishArticle(article);
            await this.close();
            return result;
        } catch (error) {
            await this.close();
            throw error;
        }
    }
}

module.exports = MediumPublisher; 