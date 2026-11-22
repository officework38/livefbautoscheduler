import fs from 'fs';
import path from 'path';
import {chromium, type BrowserContext, type Page} from 'playwright';
import type {ExecutionMode, LogLevel, TargetType} from '../types.ts';

export type LogFn = (message: string, level?: LogLevel) => void;

export interface FetchedFbResult {
  profileName: string;
  pages: Array<{name: string; url: string}>;
  cookieSummary: string;
}

export class CloudBrowserRpaManager {
  private profilesRoot: string;
  private proofsDir: string;
  private activeProfile = 'SystemB_Default';
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private browserLock = false;
  private lastLoggedIn = false;
  private lastUrl = 'about:blank';
  private lastCookieSummary = '';

  constructor(profilesRoot: string, proofsDir: string) {
    this.profilesRoot = profilesRoot;
    this.proofsDir = proofsDir;
    fs.mkdirSync(path.join(this.profilesRoot, this.activeProfile), {recursive: true});
    fs.mkdirSync(this.proofsDir, {recursive: true});
  }

  getAvailableProfiles(): string[] {
    try {
      const entries = fs.readdirSync(this.profilesRoot, {withFileTypes: true});
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      return dirs.length > 0 ? dirs : [this.activeProfile];
    } catch {
      return [this.activeProfile];
    }
  }

  async setActiveProfile(profileName: string, log: LogFn): Promise<void> {
    const clean = profileName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'SystemB_Default';
    if (clean === this.activeProfile && this.context) return;
    await this.closeBrowser(log);
    this.activeProfile = clean;
    fs.mkdirSync(path.join(this.profilesRoot, this.activeProfile), {recursive: true});
    this.lastLoggedIn = false;
    this.lastCookieSummary = '';
    log(`Switched System B Browser Profile to [${this.activeProfile}].`, 'info');
  }

  isOpen(): boolean {
    return Boolean(this.context && this.page && !this.page.isClosed());
  }

  isBusy(): boolean {
    return this.browserLock;
  }

  getStatus() {
    return {
      browserOpen: this.isOpen(),
      browserBusy: this.browserLock,
      loggedIn: this.lastLoggedIn,
      currentUrl: this.lastUrl,
      activeProfile: this.activeProfile,
      availableProfiles: this.getAvailableProfiles(),
      cookieSummary: this.lastCookieSummary,
    };
  }

  async ensureBrowser(log: LogFn): Promise<Page> {
    if (this.context && this.page && !this.page.isClosed()) {
      return this.page;
    }

    const profileDir = path.join(this.profilesRoot, this.activeProfile);
    fs.mkdirSync(profileDir, {recursive: true});
    log(`Launching Cloud Chromium [System B] with profile: ${this.activeProfile}...`, 'info');

    this.context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: {width: 1280, height: 800},
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-notifications',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const existingPages = this.context.pages();
    this.page = existingPages.length > 0 ? existingPages[0] : await this.context.newPage();
    this.page.setDefaultTimeout(25000);
    this.page.setDefaultNavigationTimeout(60000);
    return this.page;
  }

  async closeBrowser(log?: LogFn): Promise<void> {
    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // Ignore already-closed context
      }
      this.context = null;
      this.page = null;
      this.lastUrl = 'about:blank';
      log?.('Closed Cloud Chromium browser session (profile cookies saved).', 'info');
    }
  }

  async openFacebookLogin(log: LogFn): Promise<void> {
    if (this.browserLock) throw new Error('Cloud Browser is currently busy with an automation task.');
    this.browserLock = true;
    try {
      const page = await this.ensureBrowser(log);
      log('Opening https://www.facebook.com/ in Cloud Browser...', 'info');
      await page.goto('https://www.facebook.com/', {waitUntil: 'domcontentloaded', timeout: 60000});
      await page.waitForTimeout(2500);
      await this.handleCookiePopupsIfAny(page, log);
      await this.refreshSessionProbe(page);
      log(
        this.lastLoggedIn
          ? 'Facebook session already logged in! Click "Fetch Pages (System B)" anytime.'
          : 'Facebook login page ready. Use the live screen below to sign in (just like Chrome on PC).',
        this.lastLoggedIn ? 'success' : 'info'
      );
    } finally {
      this.browserLock = false;
    }
  }

  async importCookies(rawCookies: string, log: LogFn): Promise<void> {
    if (this.browserLock) throw new Error('Cloud Browser is currently busy.');
    this.browserLock = true;
    try {
      const page = await this.ensureBrowser(log);
      const ctx = page.context();

      const parsedCookies: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
      }> = [];

      const trimmed = rawCookies.trim();
      if (trimmed.startsWith('[')) {
        const arr = JSON.parse(trimmed) as Array<{name?: string; value?: string; domain?: string; path?: string}>;
        for (const item of arr) {
          if (item.name && item.value !== undefined) {
            parsedCookies.push({
              name: String(item.name),
              value: String(item.value),
              domain: item.domain || '.facebook.com',
              path: item.path || '/',
            });
          }
        }
      } else {
        for (const pair of trimmed.split(';')) {
          const eqIdx = pair.indexOf('=');
          if (eqIdx > 0) {
            const name = pair.slice(0, eqIdx).trim();
            const value = pair.slice(eqIdx + 1).trim();
            if (name && value) {
              parsedCookies.push({name, value, domain: '.facebook.com', path: '/'});
            }
          }
        }
      }

      if (parsedCookies.length === 0) {
        throw new Error('No valid cookies found. Paste format like "c_user=...; xs=...;" or JSON cookies.');
      }

      await ctx.addCookies(parsedCookies);
      await page.goto('https://www.facebook.com/', {waitUntil: 'domcontentloaded', timeout: 60000});
      await page.waitForTimeout(2500);
      await this.handleCookiePopupsIfAny(page, log);
      await this.refreshSessionProbe(page);
      log(
        this.lastLoggedIn
          ? `Imported ${parsedCookies.length} cookies — Facebook session active!`
          : `Imported ${parsedCookies.length} cookies. Check live browser view to verify login.`,
        this.lastLoggedIn ? 'success' : 'warn'
      );
    } finally {
      this.browserLock = false;
    }
  }

  async captureLiveViewport(): Promise<{imageBase64: string; url: string; loggedIn: boolean}> {
    if (!this.page || this.page.isClosed()) {
      return {imageBase64: '', url: 'about:blank', loggedIn: false};
    }
    const buf = await this.page.screenshot({type: 'jpeg', quality: 72});
    await this.refreshSessionProbe(this.page);
    return {
      imageBase64: buf.toString('base64'),
      url: this.lastUrl,
      loggedIn: this.lastLoggedIn,
    };
  }

  async sendMouseClick(x: number, y: number): Promise<void> {
    if (!this.page || this.page.isClosed()) return;
    await this.page.mouse.click(x, y);
    await this.page.waitForTimeout(450);
    await this.refreshSessionProbe(this.page);
  }

  async sendText(text: string): Promise<void> {
    if (!this.page || this.page.isClosed() || !text) return;
    await this.page.keyboard.type(text, {delay: 20});
  }

  async sendKey(key: string): Promise<void> {
    if (!this.page || this.page.isClosed()) return;
    const allowed = new Set(['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp']);
    if (!allowed.has(key)) return;
    await this.page.keyboard.press(key);
    await this.page.waitForTimeout(350);
    await this.refreshSessionProbe(this.page);
  }

  async scrollViewport(deltaY: number): Promise<void> {
    if (!this.page || this.page.isClosed()) return;
    await this.page.mouse.wheel(0, deltaY);
    await this.page.waitForTimeout(250);
  }

  async refreshSessionProbe(page: Page): Promise<boolean> {
    try {
      this.lastUrl = page.url();
      const cookies = await page.context().cookies('https://www.facebook.com');
      const hasCUser = cookies.some((c) => c.name === 'c_user' && c.value);
      const urlLower = this.lastUrl.toLowerCase();
      const blockedUrl = urlLower.includes('/login') || urlLower.includes('checkpoint');
      let hasDomSignal = false;
      if (!blockedUrl) {
        const count = await page
          .locator(
            "//a[contains(@href,'/me/') or contains(@aria-label,'Profile')] | //*[@aria-label='Create a post'] | //span[contains(.,\"What's on your mind\")]"
          )
          .count()
          .catch(() => 0);
        hasDomSignal = count > 0;
      }
      this.lastLoggedIn = !blockedUrl && (hasCUser || hasDomSignal);
      const names = cookies.map((c) => c.name).slice(0, 10);
      this.lastCookieSummary =
        cookies.length > 0
          ? `${cookies.length} active cookies (${names.join(', ')})`
          : 'No Facebook session cookies yet';
      return this.lastLoggedIn;
    } catch {
      return false;
    }
  }

  async handleCookiePopupsIfAny(page: Page, log: LogFn): Promise<boolean> {
    const cookieXpaths = [
      "//div[@role='dialog']//div[@aria-label='Allow all cookies' and @role='button']",
      "//div[@role='dialog']//div[normalize-space(.)='Allow all cookies' and @role='button']",
      "//div[@role='dialog']//span[contains(text(), 'Allow all cookies')]/ancestor::div[@role='button']",
      "//div[@role='dialog']//button[contains(., 'Allow all cookies')]",
      "//div[@aria-label='Allow all cookies']",
      "//div[@role='dialog']//span[normalize-space(.)='Allow']/ancestor::div[@role='button']",
      "//div[@role='dialog']//div[@role='button' and contains(@aria-label, 'Allow')]",
    ];
    for (const xpath of cookieXpaths) {
      try {
        const loc = page.locator(`xpath=${xpath}`).first();
        if ((await loc.count()) > 0 && (await loc.isVisible())) {
          await loc.click({force: true});
          log('Cookie / Consent dialog detected & automatically clicked Allow.', 'info');
          await page.waitForTimeout(1500);
          return true;
        }
      } catch {
        // Continue trying other consent selectors
      }
    }
    return false;
  }

  async fetchPagesSystemB(log: LogFn): Promise<FetchedFbResult> {
    if (this.browserLock) throw new Error('Cloud Browser is busy. Please wait a moment.');
    this.browserLock = true;
    try {
      const page = await this.ensureBrowser(log);
      const loggedIn = await this.refreshSessionProbe(page);
      if (!loggedIn) {
        await page.goto('https://www.facebook.com/', {waitUntil: 'domcontentloaded', timeout: 60000});
        await page.waitForTimeout(2500);
        await this.handleCookiePopupsIfAny(page, log);
        const stillNot = !(await this.refreshSessionProbe(page));
        if (stillNot) {
          throw new Error(
            'Facebook login required first! Use the Live Browser Screen above to log into Facebook, then click Fetch Pages.'
          );
        }
      }

      log('Facebook session detected. Opening Your Pages...', 'info');
      await page.goto('https://www.facebook.com/pages/?category=your_pages', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(4500);
      await this.handleCookiePopupsIfAny(page, log);

      // Exact v60.25 scroll-until-stable loop
      let previousHeight = -1;
      let stableRounds = 0;
      for (let i = 0; i < 10; i++) {
        const height = await page.evaluate(() => document.body.scrollHeight);
        await page.evaluate((h) => window.scrollTo(0, h), height);
        await page.waitForTimeout(1200);
        await this.handleCookiePopupsIfAny(page, log);
        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        if (newHeight === previousHeight) {
          stableRounds += 1;
        } else {
          stableRounds = 0;
        }
        previousHeight = newHeight;
        if (stableRounds >= 2) break;
      }

      // Exact v60.25 _extract_pages_and_profile_from_driver filtering
      const extracted = await page.evaluate(() => {
        const ignoreWords = new Set([
          'switch', 'promote', 'create', 'view', 'insights', 'manage',
          'see all', 'discover', 'liked pages', 'invites', 'notification',
          'notifications', 'message', 'messages', 'profile', 'settings',
          'marketplace', 'groups', 'watch', 'memories', 'home', 'feed',
          'menu', 'your pages', 'ads', 'ad center', 'meta business suite',
          'help', 'privacy', 'terms', 'cookies', 'more', 'learn more',
          'pages feed', 'create new page', 'switch profile',
        ]);
        const blockedUrlParts = [
          '/help/', '/privacy/', '/policies/', '/watch/', '/groups/',
          '/events/', '/marketplace/', '/gaming/', '/saved/', '/ads/',
          '/business/', '/notifications', '/messages', '/bookmarks',
          '/friends', '/memories', '/offers', '/jobs', '/fundraisers',
        ];
        const blockedTails = new Set([
          'pages', 'your_pages', 'bookmarks', 'home', 'friends', 'feed',
          'notifications', 'messages', 'marketplace', 'groups', 'watch',
          'memories', 'ads', 'settings', 'help', 'privacy', 'login',
        ]);

        const anchors = Array.from(
          document.querySelectorAll(
            'div[role="main"] a[href], main a[href], a[href*="/pages/"], a[href*="profile.php?id="]'
          )
        ) as HTMLAnchorElement[];

        const fetchedPages: Array<{name: string; url: string}> = [];
        const seenUrls = new Set<string>();
        const seenNames = new Set<string>();

        for (const link of anchors) {
          const name = (link.textContent || '').replace(/\s+/g, ' ').trim();
          let href = (link.getAttribute('href') || '').trim();
          if (!name || name.length < 2 || name.length > 90 || !href) continue;
          if (href.startsWith('/')) href = 'https://www.facebook.com' + href;
          if (!href.toLowerCase().includes('facebook.com')) continue;

          const lowName = name.toLowerCase();
          if (ignoreWords.has(lowName) || Array.from(ignoreWords).some((w) => lowName.includes(w))) {
            continue;
          }

          const lowUrl = href.toLowerCase();
          if (blockedUrlParts.some((part) => lowUrl.includes(part))) continue;

          let cleanUrl = href.split('#')[0];
          if (!cleanUrl.includes('profile.php?id=')) {
            cleanUrl = cleanUrl.split('?')[0];
          }
          const key = cleanUrl.replace(/\/+$/, '').toLowerCase();
          if (!key || seenUrls.has(key)) continue;

          const tail = key.split('/').pop() || '';
          if (blockedTails.has(tail)) continue;
          if (key === 'https://www.facebook.com' || key === 'http://www.facebook.com') continue;
          if (seenNames.has(lowName)) continue;

          seenUrls.add(key);
          seenNames.add(lowName);
          fetchedPages.push({name, url: cleanUrl});
        }

        let profileName = 'Facebook Profile';
        const profLinks = Array.from(
          document.querySelectorAll('a[href*="/me/"], a[aria-label*="Profile"]')
        );
        for (const pl of profLinks) {
          const label = (pl.textContent || '').replace(/\s+/g, ' ').trim();
          if (label && label.length > 1 && label.length < 70 && !ignoreWords.has(label.toLowerCase())) {
            profileName = label;
            break;
          }
        }

        return {profileName, fetchedPages};
      });

      await this.refreshSessionProbe(page);
      log(`System B completed. Clean pages fetched: ${extracted.fetchedPages.length}`, 'success');
      return {
        profileName: extracted.profileName,
        pages: extracted.fetchedPages,
        cookieSummary: this.lastCookieSummary,
      };
    } finally {
      this.browserLock = false;
    }
  }

  private async switchToPageIfNeeded(
    page: Page,
    targetName: string,
    targetType: TargetType,
    log: LogFn
  ): Promise<void> {
    if (targetType === 'Personal') return;
    log(`Executing 2-Step Switch verification for [${targetName}]...`, 'info');
    try {
      const switchBtn = page
        .locator(
          "xpath=//div[@aria-label='Switch Now' or @aria-label='Switch' or text()='Switch Now'] | //span[text()='Switch Now' or text()='Switch']"
        )
        .first();
      if ((await switchBtn.count()) > 0 && (await switchBtn.isVisible())) {
        await switchBtn.click({force: true});
        log("Step 1: 'Switch Now' button clicked successfully!", 'info');
        await page.waitForTimeout(3500);
        await this.handleCookiePopupsIfAny(page, log);
      }
    } catch {
      // Already switched or no Switch Now button needed
    }

    const start = Date.now();
    while (Date.now() - start < 10000) {
      await this.handleCookiePopupsIfAny(page, log);
      try {
        const popupSwitch = page
          .locator(
            "xpath=//div[@role='dialog']//div[@role='button' and (text()='Switch' or contains(., 'Switch'))] | //div[@role='dialog']//span[text()='Switch']"
          )
          .first();
        if ((await popupSwitch.count()) > 0 && (await popupSwitch.isVisible())) {
          await popupSwitch.click({force: true});
          log("Step 2: Popup 'Switch' confirmation button clicked!", 'info');
          await page.waitForTimeout(6000);
          await this.handleCookiePopupsIfAny(page, log);
          break;
        }
      } catch {
        // Keep polling briefly
      }
      await page.waitForTimeout(1000);
    }
  }

  private async commentOnFirstReel(
    page: Page,
    targetUrl: string,
    targetName: string,
    caption: string,
    modeLabel: string,
    log: LogFn
  ): Promise<void> {
    if (!caption.trim()) return;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        log(`${modeLabel} Auto-Comment Attempt ${attempt}/3: Navigating to Reels tab...`, 'info');
        await page.goto(targetUrl, {waitUntil: 'domcontentloaded', timeout: 60000});
        await page.waitForTimeout(4000);
        await this.handleCookiePopupsIfAny(page, log);

        const reelsTab = page
          .locator(
            "xpath=//span[normalize-space(.)='Reels' and not(ancestor::div[@role='dialog'])] | //a[@role='tab' and contains(., 'Reels')] | //span[text()='Reels']/ancestor::a"
          )
          .first();
        await reelsTab.click({timeout: 10000});
        await page.waitForTimeout(5000);
        await this.handleCookiePopupsIfAny(page, log);

        const firstReel = page
          .locator(
            "xpath=(//div[@role='main']//div[@role='grid']//a[contains(@href, '/reel/')])[1] | (//div[@role='main']//a[contains(@href, '/reel/')])[1]"
          )
          .first();
        await firstReel.scrollIntoViewIfNeeded();
        await firstReel.click({timeout: 10000});
        await page.waitForTimeout(4500);
        await this.handleCookiePopupsIfAny(page, log);

        const commentIcon = page
          .locator(
            "xpath=//div[@aria-label='Comment' and @role='button'] | //div[contains(@aria-label, 'Comment') and @role='button'] | //div[@aria-label='Leave a comment' and @role='button'] | //span[text()='Comment']/ancestor::div[@role='button']"
          )
          .first();
        if ((await commentIcon.count()) > 0) {
          await commentIcon.click({force: true}).catch(() => {});
          await page.waitForTimeout(1500);
        }

        const commentBox = page
          .locator(
            "xpath=//div[@aria-label='Write a comment…' and @role='textbox'] | //div[@aria-label='Write a comment' and @role='textbox'] | //div[contains(@aria-label, 'Write a comment') and @role='textbox'] | //div[@contenteditable='true' and @role='textbox']"
          )
          .first();
        await commentBox.scrollIntoViewIfNeeded();
        await commentBox.click({timeout: 10000});
        await page.keyboard.type(caption, {delay: 15});
        await page.waitForTimeout(1000);
        await page.keyboard.press('Enter');
        log(`Comment auto-posted in ${modeLabel} on [${targetName}]!`, 'success');
        await page.waitForTimeout(3000);
        break;
      } catch (err) {
        log(`${modeLabel} comment attempt ${attempt} notice: ${err instanceof Error ? err.message : String(err)}`, 'warn');
        await page.waitForTimeout(3000);
      }
    }
  }

  async executeModeRpa(
    target: {
      name: string;
      type: TargetType;
      url: string;
      mediaAbsPath: string;
      caption: string;
    },
    mode: ExecutionMode,
    log: LogFn
  ): Promise<{screenshotFilename: string; note: string}> {
    if (this.browserLock) {
      throw new Error('Cloud Browser is currently busy with another job.');
    }
    this.browserLock = true;
    try {
      const page = await this.ensureBrowser(log);
      const targetUrl = target.url || 'https://www.facebook.com/';
      log(`[${mode}] Starting real Cloud Browser execution for [${target.name}] -> ${targetUrl}`, 'info');

      await page.goto(targetUrl, {waitUntil: 'domcontentloaded', timeout: 60000});
      await page.waitForTimeout(3000);
      await this.handleCookiePopupsIfAny(page, log);

      if (!(await this.refreshSessionProbe(page))) {
        throw new Error('Facebook is not logged in inside Cloud Browser. Open Tab 01 and log in first.');
      }

      if (target.type === 'Personal') {
        await page.goto('https://www.facebook.com/profile.php', {waitUntil: 'domcontentloaded', timeout: 60000});
        await page.waitForTimeout(3000);
        await this.handleCookiePopupsIfAny(page, log);
      } else {
        await this.switchToPageIfNeeded(page, target.name, target.type, log);
      }

      log('Opening post composer feed box...', 'info');
      const composerTrigger = page
        .locator(
          "xpath=//span[contains(text(), \"What's on your mind\")] | //div[@aria-label=\"Create a post\" and not(contains(@style, 'profile'))]"
        )
        .first();
      await composerTrigger.click({timeout: 20000});
      await page.waitForTimeout(2500);
      await this.handleCookiePopupsIfAny(page, log);

      // Open Photo/video uploader inside modal
      try {
        const photoBtn = page
          .locator(
            "xpath=//div[@role='dialog']//div[@aria-label='Photo/video' or @aria-label='Photo/Video' or contains(@aria-label, 'Photo')]"
          )
          .first();
        if ((await photoBtn.count()) > 0 && (await photoBtn.isVisible())) {
          await photoBtn.click({force: true});
          await page.waitForTimeout(2000);
        }
      } catch {
        // Optional if file input is already present
      }

      if (target.mediaAbsPath && fs.existsSync(target.mediaAbsPath)) {
        log(`Injecting assigned media file: ${path.basename(target.mediaAbsPath)}`, 'info');
        const fileInput = page.locator("xpath=//div[@role='dialog']//input[@type='file'] | //input[@type='file']").last();
        await fileInput.setInputFiles(target.mediaAbsPath);
        log('Media file injected! Waiting for upload & preview rendering (15s)...', 'info');
        await page.waitForTimeout(15000);
      } else {
        log('No media file attached — posting text/caption payload.', 'warn');
      }

      // Caption / Description entry
      if (target.caption.trim()) {
        try {
          const textBox = page
            .locator(
              "xpath=//div[@role='dialog']//div[@contenteditable='true' and @role='textbox'] | //div[@role='dialog']//textarea | //div[@aria-label='Description']"
            )
            .first();
          await textBox.click({timeout: 10000});
          await page.keyboard.type(target.caption, {delay: 15});
          log('Caption / Tags entered into post composer.', 'info');
          await page.waitForTimeout(1500);
        } catch (capErr) {
          log(`Caption entry notice: ${capErr instanceof Error ? capErr.message : String(capErr)}`, 'warn');
        }
      }

      // Wizard Next -> Post / Publish / Share
      for (let step = 0; step < 6; step++) {
        const postBtn = page
          .locator(
            "xpath=//div[@role='dialog']//div[@aria-label='Post' and @role='button'] | //div[@role='dialog']//div[normalize-space(.)='Post' and @role='button'] | //div[@role='dialog']//div[normalize-space(.)='Publish' and @role='button'] | //div[@role='dialog']//div[normalize-space(.)='Share' and @role='button']"
          )
          .last();
        if ((await postBtn.count()) > 0 && (await postBtn.isVisible())) {
          await postBtn.click({force: true});
          log("Final 'Post' / 'Publish' button clicked!", 'success');
          break;
        }

        const nextBtn = page
          .locator("xpath=//div[@role='dialog']//div[@role='button'][normalize-space(.)='Next']")
          .first();
        if ((await nextBtn.count()) > 0 && (await nextBtn.isVisible())) {
          await nextBtn.click({force: true});
          log(`Wizard 'Next' clicked (Step ${step + 1})`, 'info');
          await page.waitForTimeout(4000);
        } else {
          await page.waitForTimeout(2500);
        }
      }

      log('Waiting 14s for post publication to settle...', 'info');
      await page.waitForTimeout(14000);

      // Post-publish Mode-specific comment workflows
      if (mode === 'Mode 1' || mode === 'Mode 2') {
        await this.commentOnFirstReel(page, targetUrl, target.name, target.caption, mode, log);
      } else if (mode === 'Mode 3') {
        await page.reload({waitUntil: 'domcontentloaded'});
        await page.waitForTimeout(4500);
        await this.handleCookiePopupsIfAny(page, log);
        if (target.caption.trim()) {
          const commentBox = page
            .locator(
              "xpath=//div[@aria-label='Write a comment' and @role='textbox'] | //div[contains(@aria-label, 'Write a comment')]//div[@contenteditable='true']"
            )
            .first();
          if ((await commentBox.count()) > 0) {
            await commentBox.scrollIntoViewIfNeeded();
            await commentBox.click();
            await page.keyboard.type(target.caption, {delay: 15});
            await page.keyboard.press('Enter');
            log(`Mode 3 auto-comment posted on [${target.name}]!`, 'success');
            await page.waitForTimeout(3000);
          }
        }
      } else if (mode === 'Mode 4') {
        await page.reload({waitUntil: 'domcontentloaded'});
        await page.waitForTimeout(4500);
        await this.handleCookiePopupsIfAny(page, log);
        try {
          const photosTab = page
            .locator("xpath=//div[@role='main']//span[normalize-space(.)='Photos'] | //a[@role='tab' and contains(., 'Photos')]")
            .first();
          if ((await photosTab.count()) > 0) {
            await photosTab.click();
            await page.waitForTimeout(4000);
            const firstPhoto = page
              .locator("xpath=(//div[@role='main']//a[contains(@href, 'photo.php?fbid=') or contains(@href, '/photos/')])[1]")
              .first();
            if ((await firstPhoto.count()) > 0) {
              await firstPhoto.click();
              await page.waitForTimeout(4000);
              const commentBox = page
                .locator("xpath=//div[contains(@aria-label, 'Write a comment') and @role='textbox']")
                .last();
              if ((await commentBox.count()) > 0 && target.caption.trim()) {
                await commentBox.click();
                await page.keyboard.type(target.caption, {delay: 15});
                await page.keyboard.press('Enter');
                log(`Mode 4 photo.php auto-comment posted on [${target.name}]!`, 'success');
                await page.waitForTimeout(3000);
              }
            }
          }
        } catch (m4Err) {
          log(`Mode 4 photo comment notice: ${m4Err instanceof Error ? m4Err.message : String(m4Err)}`, 'warn');
        }
      }

      const safeName = target.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40) || 'target';
      const filename = `proof_SysB_${mode.replace(/\s+/g, '')}_${safeName}_${Date.now()}.png`;
      const absProof = path.join(this.proofsDir, filename);
      await page.screenshot({path: absProof});
      log(`${mode} COMPLETED for [${target.name}]! Proof saved: ${filename}`, 'success');

      return {
        screenshotFilename: filename,
        note: `${mode} completed inside Cloud Chromium Browser.`,
      };
    } finally {
      this.browserLock = false;
    }
  }
}
