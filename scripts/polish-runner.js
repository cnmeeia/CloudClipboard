/**
 * UI Polish Runner — 调用真正的结构化规则引擎（ui-audit-engine）
 *
 * 移除旧版硬编码模拟 audit / polish / finalReview 逻辑，
 * 通过 ui-audit-engine.js 读取页面 DOM + 计算样式，
 * 应用 ALIGN / SPACE / RADIUS 规则输出真实 Issue 列表。
 *
 * 用法：
 *   node scripts/polish-runner.js <url|file>
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { runAudit } from './ui-audit-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const target = process.argv[2] || 'scripts/test-page.html';

  // 解析目标为绝对路径（支持相对 HTML 文件路径）
  let resolvedTarget = target;
  if (/^[\w./-]+\.html$/.test(target) && !/^(https?|file):\/\//.test(target)) {
    resolvedTarget = path.resolve(__dirname, '..', target);
  }

  console.log('✨ UI Polish Engine v2.0.0（真实规则引擎）');
  console.log('═'.repeat(50));

  // 运行真实结构化审计（engine 内部会打印详细问题明细）
  const report = await runAudit(resolvedTarget);

  console.log('\n✅ UI Polish Audit Complete!');
  return report;
}

main().catch((e) => {
  console.error('❌ Polish audit failed:', e.message);
  process.exit(1);
});
