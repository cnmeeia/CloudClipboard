import { promises as fs } from 'fs';
import path from 'path';

export class VisualReporter {
  constructor(config) {
    this.config = config;
  }

  generateReport(results) {
    const report = {
      timestamp: Date.now(),
      summary: this.generateSummary(results),
      viewportScores: this.generateViewportScores(results),
      issues: this.collectIssues(results),
      recommendations: this.generateRecommendations(results),
      overallScore: this.calculateOverallScore(results),
    };

    return report;
  }

  generateSummary(results) {
    const total = results.length;
    if (total === 0) {
      return { total: 0, passed: 0, failed: 0, passRate: 0 };
    }
    const passed = results.filter(r => r.mismatchPercentage < 2).length;
    const failed = total - passed;

    return {
      total,
      passed,
      failed,
      passRate: (passed / total) * 100,
    };
  }

  generateViewportScores(results) {
    const scores = {};
    for (const result of results) {
      const score = Math.max(0, 100 - (result.mismatchPercentage * 10));
      scores[result.viewport] = {
        score: Math.round(score),
        mismatchPercentage: result.mismatchPercentage,
        issues: result.issues.length,
      };
    }
    return scores;
  }

  collectIssues(results) {
    const allIssues = [];
    for (const result of results) {
      for (const issue of result.issues) {
        allIssues.push({
          viewport: result.viewport,
          ...issue,
        });
      }
    }
    return allIssues;
  }

  generateRecommendations(results) {
    const recommendations = [];

    if (results.length === 0) {
      recommendations.push('No baseline screenshots found. Run audit on initial state to establish baseline.');
      return recommendations;
    }

    // Analyze patterns
    const issues = this.collectIssues(results);

    // Group by severity
    const critical = issues.filter(i => i.severity === 'critical');
    const high = issues.filter(i => i.severity === 'high');
    const medium = issues.filter(i => i.severity === 'medium');

    if (critical.length > 0) {
      recommendations.push('Fix critical issues immediately: overflow, layout breakage');
    }

    if (high.length > 0) {
      recommendations.push('Address alignment and structure issues');
    }

    if (medium.length > 0) {
      recommendations.push('Improve spacing and visual consistency');
    }

    // Specific recommendations
    const glassIssues = issues.filter(i => i.type === 'glass');
    if (glassIssues.length > 0) {
      recommendations.push('Apply glass system tokens consistently');
    }

    return recommendations;
  }

  calculateOverallScore(results) {
    if (results.length === 0) {
      return 0;
    }
    const scores = this.generateViewportScores(results);
    const values = Object.values(scores).map(s => s.score);
    if (values.length === 0) {
      return 0;
    }
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.round(average);
  }

  async saveReport(report, outputPath) {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    const json = JSON.stringify(report, null, 2);
    await fs.writeFile(outputPath, json);

    // Also generate HTML report
    const html = this.generateHTML(report);
    const htmlPath = outputPath.replace('.json', '.html');
    await fs.writeFile(htmlPath, html);

    return { json: outputPath, html: htmlPath };
  }

  generateHTML(report) {
    const summary = report.summary || { total: 0, passed: 0, failed: 0, passRate: 0 };
    const overallScore = report.overallScore ?? 0;
    const issues = report.issues || [];
    const recommendations = report.recommendations || [];
    const viewportScores = report.viewportScores || {};

    return `<!DOCTYPE html>
<html>
<head>
    <title>Visual Regression Report</title>
    <style>
        body { font-family: system-ui; padding: 2rem; max-width: 1200px; margin: 0 auto; }
        .score { font-size: 3rem; font-weight: bold; }
        .pass { color: #22c55e; }
        .fail { color: #ef4444; }
        .viewport { margin: 1rem 0; padding: 1rem; border: 1px solid #e5e7eb; border-radius: 12px; }
        .issue { padding: 0.5rem; margin: 0.5rem 0; border-radius: 6px; }
        .critical { background: #fee2e2; border-left: 4px solid #dc2626; }
        .high { background: #fef3c7; border-left: 4px solid #f59e0b; }
        .medium { background: #dbeafe; border-left: 4px solid #3b82f6; }
        .recommendations { background: #f0fdf4; padding: 1rem; border-radius: 12px; margin-top: 2rem; }
    </style>
</head>
<body>
    <h1>📸 Visual Regression Report</h1>
    <p>Generated: ${new Date(report.timestamp || Date.now()).toLocaleString()}</p>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 2rem 0;">
        <div>
            <div class="score ${summary.passRate === 100 ? 'pass' : 'fail'}">
                ${overallScore}/100
            </div>
            <div>Overall Score</div>
        </div>
        <div>
            <div class="score pass">${summary.passRate}%</div>
            <div>Pass Rate</div>
        </div>
        <div>
            <div class="score">${summary.total}</div>
            <div>Tests Run</div>
        </div>
    </div>

    <h2>Viewports</h2>
    ${Object.entries(viewportScores).map(([viewport, data]) => `
        <div class="viewport">
            <h3>${viewport}</h3>
            <div>Score: ${data.score}/100</div>
            <div>Issues: ${data.issues}</div>
        </div>
    `).join('')}

    <h2>Issues</h2>
    ${issues.map(issue => `
        <div class="issue ${issue.severity}">
            <strong>${issue.type}</strong> - ${issue.description}
            <span style="float: right;">${issue.viewport}</span>
        </div>
    `).join('')}

    <div class="recommendations">
        <h3>💡 Recommendations</h3>
        <ul>
            ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>
</body>
</html>`;
  }
}
