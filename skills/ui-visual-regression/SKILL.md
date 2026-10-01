---
name: ui-visual-regression
description: Automated visual regression testing and AI-powered UI quality assurance. Captures screenshots, detects visual regressions, analyzes alignment and spacing issues, and automatically fixes detected problems.
version: 1.0.0
---

# UI Visual Regression Engine

Automated visual quality assurance for web interfaces.

## Workflow

```
Capture Screenshots
↓ Desktop
↓ Tablet
↓ Mobile
↓
AI Visual Analysis
↓ Alignment
↓ Spacing
↓ Overflow
↓ Glass Effects
↓ Contrast
↓
Generate Report
↓ Issues Found
↓
Auto-Fix Loop (max 3 iterations)
↓
Recapture & Verify
↓
Final Score
```

## Implementation

### 1. Capture Configuration

```javascript
export const captureConfig = {
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
  threshold: 0.01, // 1% difference threshold
};
```

### 2. Analysis Dimensions

· Layout alignment
· Element spacing
· Visual overflow
· Glass effect quality
· Color contrast
· Responsive breakpoints
· Font rendering
· Shadow consistency

### 3. Auto-Fix Capabilities

· Adjust spacing
· Fix alignment
· Normalize radius
· Apply glass corrections
· Improve contrast
· Fix overflow

### 4. Reporting

Generate visual report with:

· Side-by-side comparison
· Highlighted differences
· Score per viewport
· Overall quality score
· Recommended fixes
