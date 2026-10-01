/**
 * Full Audit — 串联结构化 UI 审计 + 视觉回归
 *
 * 核心：调用 ui-audit-engine.js（真实规则引擎）读取页面 DOM + 计算样式，
 * 应用 ALIGN / SPACE / RADIUS 规则输出真实 Issue 列表与评分，
 * 并叠加视觉回归截图对比。
 *
 * 用法：
 *   node scripts/full-audit.js <url|file>
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { runAudit } from './ui-audit-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);

class FullAudit {
  async run(target) {
    console.log('\n🚀 Web Design OS v2.0 Pro - Full Audit');
    console.log('═'.repeat(60));

    let resolvedTarget = target;
    if (/^[\w./-]+\.html$/.test(target) && !/^(https?|file):\/\//.test(target)) {
      resolvedTarget = path.resolve(__dirname, '..', target);
    }

    // Step 1: 结构化 UI 审计（真实规则引擎）
    console.log('\n1️⃣ Running Structured UI Audit (real rules)...');
    const polishStart = Date.now();
    let polishReport = null;
    try {
      polishReport = await runAudit(resolvedTarget);
    } catch (e) {
      console.log(`⚠️  UI Polish failed: ${e.message}`);
    }
    const polishTime = Date.now() - polishStart;

    // Step 2: 视觉回归截图
    console.log('\n2️⃣ Running Visual Regression...');
    const regressionStart = Date.now();
    let regressionTime = 0;
    let regressionReport = null;
    try {
      await execAsync(`node scripts/regression-runner.js "${resolvedTarget}"`);
      regressionTime = Date.now() - regressionStart;
      // 读取最新 regression 报告
      regressionReport = await this.readLatestReport('regression-');
    } catch (e) {
      console.log(`⚠️  Visual Regression failed: ${e.message}`);
    }

    // Step 3: 生成合并报告
    console.log('\n3️⃣ Generating combined report...');
    const report = this.generateCombinedReport(polishReport, regressionReport, polishTime, regressionTime);
    const reportPath = `./reports/full-audit-${Date.now()}.json`;
    await this.saveReport(report, reportPath);

    const counts = polishReport?.scores?.counts || { critical: 0, high: 0, medium: 0 };
    console.log('\n✅ Full Audit Complete!');
    console.log(`⏱️  Structured UI Audit: ${(polishTime / 1000).toFixed(2)}s`);
    console.log(`⏱️  Regression: ${(regressionTime / 1000).toFixed(2)}s`);
    console.log(`📊 Final Score: ${report.finalScore}/100`);
    console.log(`🏅 Quality Level: ${report.qualityLevel}`);
    console.log(`🔴 Critical: ${counts.critical}  🟠 High: ${counts.high}  🔵 Medium: ${counts.medium}`);
    console.log(`📄 Report: ${reportPath}`);

    if (report.issues?.length) {
      console.log('\n📝 真实审计问题明细:');
      for (const i of report.issues.slice(0, 10)) {
        const icon = i.severity === 'critical' ? '🔴' : i.severity === 'high' ? '🟠' : '🔵';
        console.log(`  ${icon} [${i.id}] ${i.problem}`);
      }
    }

    return report;
  }

  async readLatestReport(prefix) {
    try {
      const reportDir = './reports';
      await fs.mkdir(reportDir, { recursive: true });
      const files = await fs.readdir(reportDir);
      const latest = files.filter(f => f.startsWith(prefix)).sort().pop();
      if (!latest) return null;
      return JSON.parse(await fs.readFile(path.join(reportDir, latest), 'utf-8'));
    } catch {
      return null;
    }
  }

  generateCombinedReport(polishReport, regressionReport, polishTime, regressionTime) {
    const polishScore = polishReport?.scores?.final ?? 0;
    const regressionScore = regressionReport?.overallScore ?? 0;

    // 最终分：以结构化审计分为主，若没有则用 regression 分
    const finalScore = typeof polishScore === 'number' && polishScore > 0
      ? polishScore
      : typeof regressionScore === 'number' ? regressionScore : 0;

    return {
      engine: 'full-audit',
      version: '2.0.0',
      timestamp: Date.now(),
      finalScore,
      qualityLevel: polishReport?.qualityLevel || 'Unknown',
      timing: { uiPolish: polishTime, regression: regressionTime },
      issues: polishReport?.issues || [],
      recommendations: [
        ...(polishReport?.recommendations || []),
        ...(regressionReport?.recommendations || []),
      ],
      uiPolish: polishReport,
      visualRegression: regressionReport,
    };
  }

  async saveReport(report, outputPath) {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
  }
}

const audit = new FullAudit();
const target = process.argv[2] || 'scripts/test-page.html';
audit.run(target).catch(console.error);
