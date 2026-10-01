/**
 * UI Audit Engine — 真正的结构化规则引擎（MVP）
 *
 * 读取目标页面的 DOM + computed styles，应用 ALIGN / SPACE / RADIUS 规则，
 * 输出真实的 Issue 列表（id / severity / evidence / fix），
 * 并基于真实问题计算评分（结构分 + 精致度分 + Critical 门槛）。
 *
 * 用法：
 *   node scripts/ui-audit-engine.js <url|file>
 */
import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────
// 设计 Token 基准（来自 skills/ui-polish-engine/tokens）
// ─────────────────────────────
const SPACE_TOKENS = new Set([0, 4, 8, 12, 16, 20, 24, 32, 40, 48]);
const RADIUS_TOKENS = new Set([0, 8, 12, 16, 24, 28, 32, 999]);

// ─────────────────────────────
// 提取整页元素的计算样式（含父容器信息用于分组对齐）
// ─────────────────────────────
async function extractElements(page, url) {
  return await page.evaluate((targetUrl) => {
    const visible = [];
    const root = document.querySelectorAll('body *');

    const isCandidate = (el) => {
      const tag = el.tagName.toLowerCase();
      const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
      const interactive = tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea';
      const cardLike = /card|panel|item|sheet|tile|article/.test(cls);
      const navLike = /nav|link|menu/.test(cls);
      return interactive || cardLike || navLike;
    };

    for (const el of root) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (r.bottom < 0 || r.top > window.innerHeight) continue;

      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;

      const tag = el.tagName.toLowerCase();
      const cls = typeof el.className === 'string' ? el.className : '';
      if (!isCandidate(el)) continue;

      const parsePx = (v) => {
        if (!v) return null;
        // 处理科学计数法（如 rounded-full 计算值为 3.35544e+07px），
        // 此类超大值表示"完全圆角"（pill/avatar/toggle），归一到 999 token
        const sci = /(-?[\d.]+)e([+-]?\d+)/i.exec(v);
        if (sci) {
          const val = Math.abs(parseFloat(sci[1])) * Math.pow(10, parseInt(sci[2], 10));
          return val > 1000 ? 999 : Math.round(val);
        }
        const m = /(-?[\d.]+)px/.exec(v);
        return m ? Math.round(parseFloat(m[1])) : null;
      };

      // 定位父容器（用于组内对齐判断）
      let parent = el.parentElement;
      let parentInfo = null;
      if (parent && parent !== document.body) {
        const pr = parent.getBoundingClientRect();
        const pcls = typeof parent.className === 'string' ? parent.className : '';
        parentInfo = {
          cls: pcls || parent.tagName.toLowerCase(),
          x: Math.round(pr.x), y: Math.round(pr.y),
          w: Math.round(pr.width), h: Math.round(pr.height),
        };
      }

      visible.push({
        tag, cls,
        id: el.id || '',
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        paddingTop: parsePx(cs.paddingTop),
        paddingRight: parsePx(cs.paddingRight),
        paddingBottom: parsePx(cs.paddingBottom),
        paddingLeft: parsePx(cs.paddingLeft),
        marginTop: parsePx(cs.marginTop),
        marginRight: parsePx(cs.marginRight),
        marginBottom: parsePx(cs.marginBottom),
        marginLeft: parsePx(cs.marginLeft),
        radius: parsePx(cs.borderRadius),
        gap: parsePx(cs.gap),
        parent: parentInfo,
      });
    }

    return { url: targetUrl, width: window.innerWidth, height: window.innerHeight, elements: visible };
  }, url);
}

// 同父容器分组
function groupByParent(elements) {
  const groups = {};
  for (const el of elements) {
    const key = el.parent ? `${el.parent.cls}|${el.parent.x}|${el.parent.y}|${el.parent.w}` : `root|${el.x}|${el.y}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(el);
  }
  return groups;
}

// ─────────────────────────────
// 规则：SPACE-001 — 检测任意 spacing 值（非 4px token 倍数）
// ─────────────────────────────
function checkSpacing(data, issues) {
  const seen = new Set();
  for (const el of data.elements) {
    const label = el.cls || el.tag;
    // mx-auto / my-auto / m-auto 居中产生的 auto margin 是剩余空间，非刻意间距，跳过
    const clsStr = el.cls || '';
    const hasMXAuto = /\bmx-auto\b|\bm-auto\b/.test(clsStr);

    const checks = [
      ['paddingTop', el.paddingTop], ['paddingRight', el.paddingRight],
      ['paddingBottom', el.paddingBottom], ['paddingLeft', el.paddingLeft],
      ['marginTop', el.marginTop], ['marginRight', hasMXAuto ? null : el.marginRight],
      ['marginBottom', el.marginBottom], ['marginLeft', hasMXAuto ? null : el.marginLeft],
    ];
    for (const [prop, v] of checks) {
      if (v === null || v <= 0 || SPACE_TOKENS.has(v)) continue;
      const key = `${label}|${prop}|${v}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        id: 'SPACE-001',
        severity: 'high',
        category: 'spacing',
        problem: `任意间距值：${label} 的 ${prop} 为 ${v}px，不在 4px token 倍率中`,
        evidence: { element: label, property: prop, value: `${v}px` },
        fix: `替换为 spacing token（--space-1~12：4/8/12/16/20/24/32/40/48px）`,
      });
    }
    if (el.gap !== null && el.gap > 0 && !SPACE_TOKENS.has(el.gap)) {
      const key = `${label}|gap|${el.gap}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push({
          id: 'SPACE-001',
          severity: 'high',
          category: 'spacing',
          problem: `${label} 的 gap 为 ${el.gap}px，不在 4px token 倍率中`,
          evidence: { element: label, property: 'gap', value: `${el.gap}px` },
          fix: `替换为 spacing token（--space-1~12）`,
        });
      }
    }
  }
}

// ─────────────────────────────
// 规则：RADIUS-001 — 检测任意 border-radius 值（非 token）
// ─────────────────────────────
function checkRadius(data, issues) {
  const seen = new Set();
  for (const el of data.elements) {
    if (el.radius === null || el.radius === 0 || el.radius >= 999) continue;
    if (!RADIUS_TOKENS.has(el.radius)) {
      const label = el.cls || el.tag;
      const key = `${label}|${el.radius}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        id: 'RADIUS-001',
        severity: 'medium',
        category: 'radius',
        problem: `任意圆角值：${label} 的 border-radius 为 ${el.radius}px，不在 token 表中`,
        evidence: { element: label, value: `${el.radius}px` },
        fix: `替换为 radius token（--radius-xs:8px / sm:12px / md:16px / lg:24px / xl:32px）`,
      });
    }
  }
}

// ─────────────────────────────
// 规则：RADIUS-002 — 同类组件圆角不一致（同一语义组件组）
// ─────────────────────────────
function checkRadiusConsistency(data, issues) {
  // 语义组件组：button / card(article) / item
  const semanticGroups = {};
  for (const el of data.elements) {
    let group = null;
    if (el.tag === 'button') group = 'button';
    else if (el.tag === 'article') group = 'card';
    else if (/item/.test(el.cls)) group = 'item';
    else if (el.tag === 'input') group = 'input';
    else continue;
    if (el.radius === null || el.radius === 0) continue;
    if (!semanticGroups[group]) semanticGroups[group] = [];
    semanticGroups[group].push({ label: el.cls || el.tag, radius: el.radius });
  }

  for (const [group, members] of Object.entries(semanticGroups)) {
    if (members.length < 2) continue;
    const radii = [...new Set(members.map(m => m.radius))];
    if (radii.length <= 1) continue;

    const countByRadius = {};
    for (const m of members) countByRadius[m.radius] = (countByRadius[m.radius] || 0) + 1;
    const mostCommon = parseInt(Object.entries(countByRadius).sort((a, b) => b[1] - a[1])[0][0]);
    const outliers = members.filter(m => m.radius !== mostCommon);

    issues.push({
      id: 'RADIUS-002',
      severity: 'medium',
      category: 'radius',
      problem: `同类组件圆角不一致：${group} 组件出现 ${radii.join('/')}px 多种圆角`,
      evidence: {
        element: group,
        commonRadius: `${mostCommon}px`,
        outliers: outliers.map(o => `${o.label}(${o.radius}px)`),
      },
      fix: `统一 ${group} 组件的 border-radius 为相同 token 值`,
    });
  }
}

// ─────────────────────────────
// 规则：ALIGN-001 — 同一容器内同类型元素左边缘不对齐
// ─────────────────────────────
function checkAlignment(data, issues) {
  const groups = groupByParent(data.elements);

  for (const [parentKey, members] of Object.entries(groups)) {
    // 按类型分组
    const byType = {};
    for (const el of members) {
      const type = el.tag === 'button' ? 'button' : el.tag === 'article' ? 'card' : null;
      if (!type) continue;
      if (!byType[type]) byType[type] = [];
      byType[type].push(el);
    }

    for (const [type, items] of Object.entries(byType)) {
      if (items.length < 2) continue;
      const xs = items.map(i => i.x);
      const leftMost = Math.min(...xs);
      const tolerance = 2;
      const misaligned = items.filter(i => i.x > leftMost + tolerance);

      // 至少 2 个元素共享左轴才有意义
      const aligned = items.filter(i => i.x <= leftMost + tolerance).length;
      if (aligned < 2) continue;

      if (misaligned.length > 0) {
        issues.push({
          id: 'ALIGN-001',
          severity: 'critical',
          category: 'alignment',
          problem: `同一容器内 ${type} 左边缘未对齐：${misaligned.length} 个元素偏离左轴 ${leftMost}px`,
          evidence: {
            element: type,
            container: parentKey,
            leftAxis: `${leftMost}px`,
            misaligned: misaligned.map(m => `${m.cls || m.tag}@x=${m.x}px`),
          },
          fix: `统一容器内 ${type} 的共享水平 padding，确保左边缘对齐`,
        });
      }
    }
  }
}

// ─────────────────────────────
// 规则：ALIGN-002 — 块级组件（卡片）宽度不一致
// ─────────────────────────────
function checkWidthConsistency(data, issues) {
  // 仅针对块级元素（卡片/列表项/输入），不判断按钮（文本自适应宽度）
  const blockGroups = {};
  for (const el of data.elements) {
    let group = null;
    if (el.tag === 'article') group = 'card';
    else if (/item/.test(el.cls)) group = 'item';
    else if (el.tag === 'input') group = 'input';
    else continue;
    if (!blockGroups[group]) blockGroups[group] = [];
    blockGroups[group].push(el);
  }

  for (const [group, members] of Object.entries(blockGroups)) {
    if (members.length < 2) continue;
    const widths = members.map(m => m.w);
    const widthsSet = [...new Set(widths)];
    if (widthsSet.length <= 1) continue;

    const countByWidth = {};
    for (const w of widths) countByWidth[w] = (countByWidth[w] || 0) + 1;
    const mostCommon = parseInt(Object.entries(countByWidth).sort((a, b) => b[1] - a[1])[0][0]);
    const outliers = members.filter(m => m.w !== mostCommon);

    issues.push({
      id: 'ALIGN-002',
      severity: 'high',
      category: 'alignment',
      problem: `${group} 组件宽度不一致：出现 ${widthsSet.join('/')}px 多种宽度`,
      evidence: {
        element: group,
        commonWidth: `${mostCommon}px`,
        outliers: outliers.map(o => `${o.cls || o.tag}(${o.w}px)`),
      },
      fix: `统一 ${group} 的宽度或使用 grid 布局确保列宽一致`,
    });
  }
}

// ─────────────────────────────
// 评分模型：结构分 + 精致度分 + Critical 门槛
// ─────────────────────────────
function calculateScores(issues) {
  const counts = { critical: 0, high: 0, medium: 0 };
  for (const i of issues) counts[i.severity]++;

  const structuralIssues = issues.filter(i => ['alignment', 'spacing'].includes(i.category));
  const polishIssues = issues.filter(i => i.category === 'radius');

  const structural = Math.max(0, 10 - structuralIssues.reduce((acc, i) => {
    if (i.severity === 'critical') return acc + 2.5;
    if (i.severity === 'high') return acc + 1.5;
    return acc + 0.8;
  }, 0));

  const polish = Math.max(0, 10 - polishIssues.reduce((acc, i) => {
    if (i.severity === 'critical') return acc + 2;
    if (i.severity === 'high') return acc + 1.2;
    return acc + 0.7;
  }, 0));

  let final = (structural * 0.55 + polish * 0.45) * 10;

  if (counts.critical > 0) final = Math.min(final, 70);
  if (counts.critical === 0 && counts.high >= 2) final = Math.min(final, 85);

  return {
    structural: Math.round(structural * 10) / 10,
    polish: Math.round(polish * 10) / 10,
    final: Math.round(final * 10) / 10,
    counts,
  };
}

function qualityLevel(final) {
  if (final >= 85) return 'Premium';
  if (final >= 70) return 'Good';
  if (final >= 50) return 'Needs Work';
  return 'Poor';
}

function generateReport(targetUrl, data, issues) {
  const scores = calculateScores(issues);
  const sortedIssues = [...issues].sort((a, b) => {
    const sev = { critical: 3, high: 2, medium: 1 };
    return (sev[b.severity] || 0) - (sev[a.severity] || 0);
  });

  const recommendations = sortedIssues.slice(0, 5).map(i => `[${i.id}] ${i.fix}`);
  if (sortedIssues.length === 0) {
    recommendations.unshift('未发现明显问题，UI 符合 token 规范');
  }

  return {
    engine: 'ui-audit-engine',
    version: '2.0.0',
    timestamp: Date.now(),
    target: targetUrl,
    viewport: { width: data.width, height: data.height },
    elementCount: data.elements.length,
    scores: {
      structural: scores.structural,
      polish: scores.polish,
      final: scores.final,
      counts: scores.counts,
    },
    qualityLevel: qualityLevel(scores.final),
    issues: sortedIssues,
    recommendations,
  };
}

// ─────────────────────────────
// 主入口
// ─────────────────────────────
async function runAudit(target) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    let url = target;
    if (/^(file|https?):\/\//.test(target)) {
      url = target;
    } else if (target.endsWith('.html')) {
      url = 'file://' + path.resolve(target);
    }

    console.log(`🌐 加载页面: ${url}`);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    // 依据页面完整高度调整视口，确保整页元素都能被审计
    const fullHeight = await page.evaluate(() => Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    ));
    if (fullHeight > 900) {
      await page.setViewportSize({ width: 1280, height: Math.min(fullHeight + 120, 6000) });
      await page.waitForTimeout(200);
    }

    const data = await extractElements(page, url);

    const issues = [];
    checkSpacing(data, issues);
    checkRadius(data, issues);
    checkRadiusConsistency(data, issues);
    checkAlignment(data, issues);
    checkWidthConsistency(data, issues);

    const report = generateReport(url, data, issues);

    const reportDir = path.join(__dirname, '..', 'reports');
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `audit-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    const counts = report.scores.counts;
    console.log(`\n✅ Audit Complete!`);
    console.log(`📐 扫描元素: ${report.elementCount}`);
    console.log(`📊 Final Score: ${report.scores.final}/100`);
    console.log(`🏅 Quality Level: ${report.qualityLevel}`);
    console.log(`🔴 Critical: ${counts.critical}  🟠 High: ${counts.high}  🔵 Medium: ${counts.medium}`);
    console.log(`📄 Report saved to: ${reportPath}`);
    console.log(`\n📝 问题明细:`);
    for (const i of report.issues) {
      const icon = i.severity === 'critical' ? '🔴' : i.severity === 'high' ? '🟠' : '🔵';
      console.log(`  ${icon} [${i.id}] ${i.problem}`);
      console.log(`     📎 evidence: ${JSON.stringify(i.evidence)}`);
    }

    return report;
  } finally {
    await browser.close();
  }
}

export { runAudit, extractElements, checkSpacing, checkRadius, checkRadiusConsistency, checkAlignment, checkWidthConsistency, calculateScores };

// 主入口守卫：仅当直接执行本文件时才运行
const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isDirectRun) {
  const target = process.argv[2] || 'http://localhost:3000';
  runAudit(target).catch((e) => {
    console.error('❌ Audit failed:', e.message);
    process.exit(1);
  });
}
