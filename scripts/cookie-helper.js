#!/usr/bin/env node

/**
 * Medium Cookie 抓取和管理工具
 * 支持手动登录后抓取Cookie，供自动化系统使用
 */

const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../lib/utils');

class CookieHelper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.cookieFile = path.join(process.cwd(), 'cookies.json');
    }

    /**
 * 启动浏览器进行手动登录
 */
    async startManualLogin(skipVerification = false) {
        try {
            console.log('\n🚀 启动浏览器进行手动登录...\n');

            // 启动可见浏览器
            this.browser = await puppeteer.launch({
                headless: false, // 显示浏览器界面
                slowMo: 50,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--window-size=1200,800'
                ]
            });

            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1200, height: 800 });

            // 访问Medium登录页面
            console.log('📂 正在打开Medium登录页面...');
            await this.page.goto('https://medium.com/m/signin', {
                waitUntil: 'networkidle2'
            });

            console.log('\n✨ 浏览器已打开！请在浏览器中手动完成以下步骤：');
            console.log('1. 📧 使用您的Google邮箱登录Medium');
            console.log('2. ✅ 完成所有验证步骤（验证码、两步验证等）');
            console.log('3. 🏠 确保最终到达Medium主页');
            console.log('4. ⌨️  然后返回终端，按任意键继续...\n');

            // 等待用户手动登录
            await this.waitForUserInput();

            if (!skipVerification) {
                // 检查登录状态
                try {
                    await this.verifyLoginStatus();
                } catch (error) {
                    console.log('\n⚠️  登录验证失败，但您可以选择强制继续抓取Cookie');
                    console.log('按 y 强制继续，按其他键取消：');

                    const userChoice = await this.waitForUserChoice();
                    if (userChoice.toLowerCase() !== 'y') {
                        throw new Error('用户取消操作');
                    }
                    console.log('🚀 强制继续抓取Cookie...');
                }
            } else {
                console.log('⏭️  跳过登录验证，直接抓取Cookie...');
            }

            // 抓取Cookie
            await this.extractCookies();

            console.log('\n🎉 Cookie抓取完成！现在可以使用自动化登录了。');

        } catch (error) {
            console.error('❌ Cookie抓取失败:', error.message);
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    /**
     * 等待用户输入选择
     */
    async waitForUserChoice() {
        return new Promise((resolve) => {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.once('data', (data) => {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                resolve(data.toString());
            });
        });
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

    /**
 * 验证登录状态
 */
    async verifyLoginStatus() {
        try {
            console.log('🔍 正在验证登录状态...');

            const currentUrl = this.page.url();
            console.log(`当前页面: ${currentUrl}`);

            // 检查是否在Medium主页或个人页面
            if (currentUrl.includes('medium.com') &&
                !currentUrl.includes('signin') &&
                !currentUrl.includes('login')) {

                // 使用多种方式检查是否已登录
                const loginStatus = await this.page.evaluate(() => {
                    const results = {
                        hasUserMenu: false,
                        hasWriteButton: false,
                        hasUserAvatar: false,
                        foundElements: []
                    };

                    // 检查各种可能的登录标识
                    const selectors = [
                        // 用户头像相关
                        '[data-testid="headerUserMenu"]',
                        '[data-testid="user-menu"]',
                        '.avatar',
                        'img[alt*="@"]',
                        '[aria-label*="profile"]',
                        '[aria-label*="Profile"]',
                        // 写作按钮
                        '[data-testid="writeButton"]',
                        'a[href*="/new-story"]',
                        'button:contains("Write")',
                        // 用户相关元素
                        '[data-testid="user"]',
                        '.user-avatar',
                        '.profile-image'
                    ];

                    selectors.forEach(selector => {
                        try {
                            const element = document.querySelector(selector);
                            if (element) {
                                results.foundElements.push(selector);

                                if (selector.includes('avatar') || selector.includes('profile') || selector.includes('user')) {
                                    results.hasUserAvatar = true;
                                }
                                if (selector.includes('write') || selector.includes('Write')) {
                                    results.hasWriteButton = true;
                                }
                                if (selector.includes('Menu') || selector.includes('menu')) {
                                    results.hasUserMenu = true;
                                }
                            }
                        } catch (e) {
                            // 忽略querySelector错误
                        }
                    });

                    // 检查是否有包含"Write"文本的按钮
                    const writeButtons = Array.from(document.querySelectorAll('button, a')).filter(el =>
                        el.textContent && el.textContent.toLowerCase().includes('write')
                    );
                    if (writeButtons.length > 0) {
                        results.hasWriteButton = true;
                        results.foundElements.push('Write button found');
                    }

                    // 检查导航栏中是否有用户相关元素
                    const navElements = document.querySelectorAll('nav *[alt], nav img, header *[alt], header img');
                    if (navElements.length > 0) {
                        results.hasUserAvatar = true;
                        results.foundElements.push('Navigation user elements found');
                    }

                    return results;
                });

                console.log(`🔍 发现的登录标识: ${loginStatus.foundElements.join(', ')}`);
                console.log(`📝 写作按钮: ${loginStatus.hasWriteButton ? '✅' : '❌'}`);
                console.log(`👤 用户头像: ${loginStatus.hasUserAvatar ? '✅' : '❌'}`);
                console.log(`🍎 用户菜单: ${loginStatus.hasUserMenu ? '✅' : '❌'}`);

                // 如果找到任何登录标识，认为已登录
                const isLoggedIn = loginStatus.hasWriteButton ||
                    loginStatus.hasUserAvatar ||
                    loginStatus.hasUserMenu ||
                    loginStatus.foundElements.length > 0;

                if (isLoggedIn) {
                    console.log('✅ 登录状态验证成功！');
                    return true;
                }
            }

            throw new Error('登录状态验证失败，请确保已完全登录');
        } catch (error) {
            console.error('❌ 登录验证失败:', error.message);
            console.log('\n🔍 调试信息：请检查页面是否有以下元素：');
            console.log('- Write/写作 按钮');
            console.log('- 用户头像或个人资料图片');
            console.log('- 用户菜单或导航元素');

            console.log('\n💡 如果您确定已登录，可以跳过验证直接抓取Cookie');
            console.log('   修改代码或手动确认后继续...');
            throw error;
        }
    }

    /**
     * 抓取并保存Cookie
     */
    async extractCookies() {
        try {
            console.log('🍪 正在抓取Cookie...');

            // 获取所有Cookie
            const cookies = await this.page.cookies();

            if (cookies.length === 0) {
                throw new Error('未找到任何Cookie');
            }

            // 过滤出Medium相关的重要Cookie
            const importantCookies = cookies.filter(cookie => {
                return cookie.domain.includes('medium.com') ||
                    cookie.name.includes('session') ||
                    cookie.name.includes('auth') ||
                    cookie.name.includes('uid') ||
                    cookie.name.includes('sid');
            });

            // 保存Cookie信息
            const cookieData = {
                extractedAt: new Date().toISOString(),
                url: this.page.url(),
                userAgent: await this.page.evaluate(() => navigator.userAgent),
                cookies: cookies,
                importantCookies: importantCookies
            };

            await fs.writeJson(this.cookieFile, cookieData, { spaces: 2 });

            console.log(`✅ Cookie已保存到: ${this.cookieFile}`);
            console.log(`📊 总共抓取 ${cookies.length} 个Cookie`);
            console.log(`🎯 其中重要Cookie ${importantCookies.length} 个`);

            // 显示重要Cookie信息
            if (importantCookies.length > 0) {
                console.log('\n🔑 重要Cookie:');
                importantCookies.forEach(cookie => {
                    console.log(`  - ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
                });
            }

        } catch (error) {
            console.error('❌ Cookie抓取失败:', error.message);
            throw error;
        }
    }

    /**
     * 测试已保存的Cookie
     */
    async testSavedCookies() {
        try {
            console.log('\n🧪 测试已保存的Cookie...');

            if (!await fs.pathExists(this.cookieFile)) {
                throw new Error('未找到Cookie文件，请先运行抓取命令');
            }

            const cookieData = await fs.readJson(this.cookieFile);
            console.log(`📅 Cookie抓取时间: ${cookieData.extractedAt}`);

            // 启动浏览器测试
            this.browser = await puppeteer.launch({
                headless: false,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            this.page = await this.browser.newPage();

            // 设置相同的User Agent
            if (cookieData.userAgent) {
                await this.page.setUserAgent(cookieData.userAgent);
            }

            // 应用Cookie
            await this.page.setCookie(...cookieData.cookies);

            // 访问Medium主页
            console.log('🌐 正在访问Medium主页...');
            await this.page.goto('https://medium.com', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 检查登录状态
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
                console.log('✅ Cookie测试成功！自动登录有效');

                // 尝试获取用户信息
                const userInfo = await this.page.evaluate(() => {
                    const userMenu = document.querySelector('[data-testid="headerUserMenu"] img') ||
                        document.querySelector('.avatar img');
                    return userMenu ? userMenu.alt || userMenu.title : null;
                });

                if (userInfo) {
                    console.log(`👤 已登录用户: ${userInfo}`);
                }
            } else {
                console.log('❌ Cookie测试失败，可能已过期');
                console.log('建议重新抓取Cookie');
            }

        } catch (error) {
            console.error('❌ Cookie测试失败:', error.message);
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    /**
     * 显示Cookie信息
     */
    async showCookieInfo() {
        try {
            if (!await fs.pathExists(this.cookieFile)) {
                console.log('❌ 未找到Cookie文件');
                return;
            }

            const cookieData = await fs.readJson(this.cookieFile);

            console.log('\n📊 Cookie信息:');
            console.log(`📅 抓取时间: ${cookieData.extractedAt}`);
            console.log(`🌐 原始URL: ${cookieData.url}`);
            console.log(`🔧 User Agent: ${cookieData.userAgent}`);
            console.log(`🍪 总Cookie数: ${cookieData.cookies.length}`);
            console.log(`🎯 重要Cookie数: ${cookieData.importantCookies.length}`);

            // 检查Cookie是否过期
            const now = new Date();
            const expiredCookies = cookieData.cookies.filter(cookie => {
                if (cookie.expires && cookie.expires !== -1) {
                    return new Date(cookie.expires * 1000) < now;
                }
                return false;
            });

            if (expiredCookies.length > 0) {
                console.log(`⚠️  已过期Cookie: ${expiredCookies.length} 个`);
            } else {
                console.log('✅ 所有Cookie仍有效');
            }

        } catch (error) {
            console.error('❌ 读取Cookie信息失败:', error.message);
        }
    }

    /**
     * 清除已保存的Cookie
     */
    async clearCookies() {
        try {
            if (await fs.pathExists(this.cookieFile)) {
                await fs.remove(this.cookieFile);
                console.log('✅ Cookie文件已清除');
            } else {
                console.log('ℹ️  没有找到Cookie文件');
            }
        } catch (error) {
            console.error('❌ 清除Cookie失败:', error.message);
        }
    }
}

// 命令行处理
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'extract';

    const helper = new CookieHelper();

    try {
        switch (command) {
            case 'extract':
            case 'capture':
                await helper.startManualLogin();
                break;

            case 'extract-force':
            case 'force':
                await helper.startManualLogin(true); // 跳过验证
                break;

            case 'test':
                await helper.testSavedCookies();
                break;

            case 'info':
            case 'show':
                await helper.showCookieInfo();
                break;

            case 'clear':
            case 'clean':
                await helper.clearCookies();
                break;

            default:
                console.log(`
🍪 Medium Cookie 管理工具

用法:
  node scripts/cookie-helper.js extract       # 手动登录并抓取Cookie（完整验证）
  node scripts/cookie-helper.js extract-force # 手动登录并强制抓取Cookie（跳过验证）
  node scripts/cookie-helper.js test          # 测试已保存的Cookie
  node scripts/cookie-helper.js info          # 显示Cookie信息
  node scripts/cookie-helper.js clear         # 清除已保存的Cookie

推荐流程:
  1. extract       - 首次手动登录抓取Cookie（推荐）
  2. extract-force - 如果验证失败但确实已登录，强制抓取
  3. test          - 验证Cookie是否有效
  4. 使用自动化系统正常发布文章

故障排除:
  如果 extract 命令验证登录失败，但您确定已经登录，请使用 extract-force
        `);
                break;
        }
    } catch (error) {
        console.error('执行失败:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = CookieHelper; 