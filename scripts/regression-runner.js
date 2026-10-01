/**
 * Visual Regression Runner — 截图 + 对比基线（MVP：仅 Audit，不做 Auto-Fix）
 *
 * 按用户要求先只做 Audit，不做 Auto-Fix 和多轮循环。
 * 无基线时首次运行仅截图，不进行对比，供后续建立基线。
 *
 * 用法：
 *   node scripts/regression-runner.js <url|file>
 */
import { ScreenshotCapture } from '../skills/ui-visual-regression/capture.js';
import { VisualAnalyzer } from '../skills/ui-visual-regression/analyzer.js';
import { VisualReporter } from '../skills/ui-visual-regression/reporter.js';
import fs from 'fs/promises';
import path from 'path';

class RegressionRunner {
  constructor(config) {
    this.config = config;
    this.capture = new ScreenshotCapture(config);
    this.analyzer = new VisualAnalyzer(config);
    this.reporter = new VisualReporter(config);
  }

  async run(url) {
    console.log('\n📸 Starting Visual Regression Run');
    console.log('═'.repeat(50));

    try {
      await this.capture.initialize();

      // Step 1: Capture screenshots
      console.log('\n📷 Capturing screenshots...');
      const screenshots = await this.capture.captureAll(url);

      // Step 2: Analyze against baselines
      console.log('\n🔍 Analyzing screenshots...');
      const baselines = await this.loadBaselines();
      const results = await this.analyzer.analyzeScreenshots(screenshots, baselines);

      if (results.length === 0) {
        console.log('\nℹ️  No baselines found. First run detected — screenshots captured but no comparison performed.');
        console.log('   Run audit again after establishing baselines to get visual regression scores.');
      }

      // Step 3: Generate report（仅 Audit，不做 Auto-Fix）
      console.log('\n📊 Generating report...');
      const report = this.reporter.generateReport(results);

      // Step 4: Save report
      const outputPath = `./reports/regression-${Date.now()}.json`;
      await this.reporter.saveReport(report, outputPath);

      console.log('\n✅ Regression Complete!');
      console.log(`📊 Overall Score: ${report.overallScore}/100`);
      console.log(`📄 Report saved to: ${outputPath}`);

      return report;
    } finally {
      await this.capture.close();
    }
  }

  async loadBaselines() {
    const baselines = [];
    for (const viewport of this.config.viewports) {
      const baselinePath = `./screenshots/baseline/${viewport.name}.png`;
      try {
        await fs.access(baselinePath);
        baselines.push({ viewport: viewport.name, filepath: baselinePath });
      } catch (e) {
        // Baseline 不存在 - 跳过
      }
    }
    return baselines;
  }
}

const config = {
  viewports: [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 812 },
  ],
  paths: {
    screenshots: './screenshots/',
    baseline: './screenshots/baseline/',
    diffs: './screenshots/diffs/',
  },
  threshold: 0.01,
};

const runner = new RegressionRunner(config);
let url = process.argv[2] || 'http://localhost:3000';
// 本地 HTML 文件转 file:// 路径
if (/^[\w./-]+\.html$/.test(url) && !/^(https?|file):\/\//.test(url)) {
  url = 'file://' + path.resolve(url);
}
runner.run(url).catch(console.error);
