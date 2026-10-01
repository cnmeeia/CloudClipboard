import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

export class ScreenshotCapture {
  constructor(config) {
    this.config = config;
    this.browser = null;
  }

  async initialize() {
    await this.ensureDirectories();
    this.browser = await chromium.launch({ headless: true });
  }

  async ensureDirectories() {
    const paths = Object.values(this.config.paths || {});
    for (const dir of paths) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async capturePage(url, viewport) {
    const page = await this.browser.newPage();
    await page.setViewportSize(viewport);

    try {
      // file:// 页面无网络请求，用 load；网络页面用 networkidle
      const waitUntil = url.startsWith('file://') ? 'load' : 'networkidle';
      await page.goto(url, { waitUntil });
      await page.waitForTimeout(800); // Wait for animations

      const screenshot = await page.screenshot({
        fullPage: true,
        type: 'png',
      });

      const filename = `${viewport.name}-${Date.now()}.png`;
      const filepath = path.join(this.config.paths.screenshots, filename);

      await fs.writeFile(filepath, screenshot);

      return {
        filename,
        filepath,
        viewport: viewport.name,
        timestamp: Date.now(),
      };
    } finally {
      await page.close();
    }
  }

  async captureAll(url) {
    const results = [];

    for (const viewport of this.config.viewports) {
      console.log(`📸 Capturing ${viewport.name}...`);
      const result = await this.capturePage(url, viewport);
      results.push(result);
    }

    return results;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
