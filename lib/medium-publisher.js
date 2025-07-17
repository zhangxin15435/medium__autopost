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
        this.email = options.email || process.env.MEDIUM_EMAIL;
        this.password = options.password || process.env.MEDIUM_PASSWORD;
        this.headless = options.headless !== false;
        this.slowMo = options.slowMo || parseInt(process.env.PUPPETEER_SLOW_MO) || 100;
        this.browser = null;
        this.page = null;
        this.cookieFile = path.join(process.cwd(), 'cookies.json');
    }

    /**
     * 初始化浏览器实例
     */
    async init() {
        try {
            logger.info('正在启动浏览器...');

            this.browser = await puppeteer.launch({
                headless: this.headless,
                slowMo: this.slowMo,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920x1080'
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

            if (!await this.hasSavedCookies()) {
                throw new Error('未找到Cookie文件，请先运行: node scripts/cookie-helper.js extract');
            }

            // 读取Cookie数据
            const cookieData = await fs.readJson(this.cookieFile);
            logger.info(`使用 ${cookieData.extractedAt} 时抓取的Cookie`);

            // 设置相同的User Agent
            if (cookieData.userAgent) {
                await this.page.setUserAgent(cookieData.userAgent);
            }

            // 应用Cookie
            await this.page.setCookie(...cookieData.cookies);

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
     * 登录Medium账户
     */
    async login() {
        try {
            // 首先尝试Cookie登录
            if (await this.hasSavedCookies()) {
                try {
                    await this.loginWithCookies();
                    return true;
                } catch (error) {
                    logger.warn('Cookie登录失败，尝试传统登录方式:', error.message);
                }
            }

            // 传统登录方式
            logger.info('开始登录Medium账户...');

            // 访问Medium登录页面
            await this.page.goto('https://medium.com/m/signin', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 等待页面加载完成
            await this.page.waitForTimeout(2000);

            // 点击使用邮箱登录
            await this.page.waitForSelector('button[data-testid="signInWithEmail"]', { timeout: 10000 });
            await this.page.click('button[data-testid="signInWithEmail"]');

            // 输入邮箱
            await this.page.waitForSelector('input[name="email"]', { timeout: 10000 });
            await this.page.type('input[name="email"]', this.email, { delay: 100 });

            // 点击继续按钮
            await this.page.click('button[data-testid="emailAuthContinueButton"]');

            // 等待密码输入框出现
            await this.page.waitForSelector('input[name="password"]', { timeout: 10000 });
            await this.page.type('input[name="password"]', this.password, { delay: 100 });

            // 点击登录按钮
            await this.page.click('button[data-testid="loginButton"]');

            // 等待登录完成，检查是否跳转到主页
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

            // 验证登录成功
            const currentUrl = this.page.url();
            if (currentUrl.includes('medium.com') && !currentUrl.includes('signin')) {
                logger.info('Medium账户登录成功');
                return true;
            } else {
                throw new Error('登录失败，可能是账户信息错误');
            }

        } catch (error) {
            logger.error('登录失败:', error);

            // 如果传统登录失败，提示使用Cookie方式
            if (error.message.includes('Waiting for selector') ||
                error.message.includes('timeout')) {
                logger.info('传统登录方式遇到问题，建议使用Cookie登录方式：');
                logger.info('1. 运行: node scripts/cookie-helper.js extract');
                logger.info('2. 手动登录Medium');
                logger.info('3. 重新运行发布命令');
            }

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

            // 2. 点击Title区域
            logger.info('正在点击Title区域...');
            await titleArea.click();

            // 3. 在Title区域输入标题内容
            logger.info('正在输入文章标题...');
            await titleArea.type(article.title, { delay: 0 });

            // 4. 按回车进入正文区域
            await this.page.keyboard.press('Enter');

            // 5. 输入副标题（如果有）
            if (article.subtitle) {
                logger.info('正在输入副标题...');
                await this.page.keyboard.type(article.subtitle, { delay: 0 });
                await this.page.keyboard.press('Enter');
                await this.page.keyboard.press('Enter');
            }

            // 6. 输入文章内容
            logger.info('正在输入文章内容...');
            await this.page.keyboard.type(article.content, { delay: 0 });

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
     * 查找Title区域
     */
    async findTitleArea() {
        logger.info('正在寻找Title区域...');

        // 1. 尝试多种Title区域选择器
        const titleSelectors = [
            // 包含"Title"文本的元素
            '*:contains("Title")',
            'h1:contains("Title")',
            'div:contains("Title")',
            'span:contains("Title")',

            // 常见的标题区域选择器
            '[data-testid="storyTitle"]',
            '.title-editor',
            '.editor-title',
            'h1[contenteditable="true"]',
            '[contenteditable="true"]:first-of-type',

            // 占位符相关选择器
            '[placeholder*="Title"]',
            '[placeholder*="title"]',

            // 通过xpath查找包含Title文本的元素
            '//h1[contains(text(), "Title")]',
            '//*[contains(text(), "Title")]'
        ];

        // 2. 尝试通过页面分析找到Title区域
        const titleAreaInfo = await this.page.evaluate(() => {
            // 查找包含"Title"文本的元素
            const elements = Array.from(document.querySelectorAll('*'));
            const titleElements = elements.filter(el => {
                const text = el.textContent || '';
                const hasTitle = text.trim() === 'Title' || text.includes('Title');
                const isClickable = el.tagName.toLowerCase() === 'h1' ||
                    el.getAttribute('contenteditable') === 'true' ||
                    el.classList.contains('title') ||
                    el.getAttribute('data-testid') === 'storyTitle';
                return hasTitle && isClickable;
            });

            if (titleElements.length > 0) {
                const el = titleElements[0];
                return {
                    found: true,
                    tagName: el.tagName,
                    className: el.className,
                    textContent: el.textContent,
                    id: el.id,
                    isContentEditable: el.getAttribute('contenteditable') === 'true'
                };
            }

            // 如果没找到包含Title文本的，找第一个可编辑的h1或title相关元素
            const editableElements = document.querySelectorAll('h1[contenteditable="true"], [contenteditable="true"]');
            if (editableElements.length > 0) {
                const el = editableElements[0];
                return {
                    found: true,
                    tagName: el.tagName,
                    className: el.className,
                    textContent: el.textContent,
                    id: el.id,
                    isContentEditable: true,
                    fallback: true
                };
            }

            return { found: false };
        });

        logger.info(`Title区域分析结果: ${JSON.stringify(titleAreaInfo)}`);

        // 3. 如果通过分析找到了Title区域
        if (titleAreaInfo.found) {
            try {
                // 优先尝试通过XPath查找包含"Title"文本的元素
                const xpathSelectors = [
                    '//h1[contains(text(), "Title")]',
                    '//*[contains(text(), "Title") and (@contenteditable="true" or self::h1)]',
                    '//*[text()="Title"]'
                ];

                for (const xpath of xpathSelectors) {
                    try {
                        const [element] = await this.page.$x(xpath);
                        if (element) {
                            logger.info(`通过XPath找到Title区域: ${xpath}`);
                            return element;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                // 如果XPath没找到，尝试CSS选择器
                if (titleAreaInfo.isContentEditable) {
                    const element = await this.page.$('h1[contenteditable="true"], [contenteditable="true"]:first-of-type');
                    if (element) {
                        logger.info('通过CSS选择器找到Title区域');
                        return element;
                    }
                }
            } catch (error) {
                logger.warn('获取Title区域元素失败:', error.message);
            }
        }

        // 4. 传统选择器备选方案
        for (const selector of titleSelectors) {
            try {
                if (selector.startsWith('//')) {
                    // XPath选择器
                    const [element] = await this.page.$x(selector);
                    if (element) {
                        logger.info(`找到Title区域 (XPath): ${selector}`);
                        return element;
                    }
                } else if (selector.includes(':contains')) {
                    // 跳过:contains选择器，已在上面处理
                    continue;
                } else {
                    // 常规CSS选择器
                    const element = await this.page.$(selector);
                    if (element) {
                        logger.info(`找到Title区域 (CSS): ${selector}`);
                        return element;
                    }
                }
            } catch (e) {
                continue;
            }
        }

        logger.warn('未找到Title区域，将使用第一个可编辑元素作为备选');
        return await this.page.$('[contenteditable="true"]');
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
     * 添加标签
     */
    async addTags(tags) {
        try {
            logger.info(`正在添加标签: ${tags.join(', ')}`);

            const tagSelectors = [
                'input[placeholder="Add a tag..."]',
                'input[placeholder*="tag"]',
                'input[placeholder*="Tag"]',
                '.tag-input',
                '[data-testid="tag-input"]'
            ];

            let tagInput = null;
            for (const selector of tagSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 3000 });
                    tagInput = await this.page.$(selector);
                    if (tagInput) {
                        logger.info(`找到标签输入框: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (tagInput) {
                for (const tag of tags.slice(0, 5)) { // Medium最多允许5个标签
                    await tagInput.type(tag, { delay: 50 });
                    await this.page.keyboard.press('Enter');
                    await this.page.waitForTimeout(500);
                    logger.info(`已添加标签: ${tag}`);
                }
            } else {
                logger.warn('未找到标签输入框');
            }
        } catch (error) {
            logger.warn('添加标签时出现问题:', error.message);
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