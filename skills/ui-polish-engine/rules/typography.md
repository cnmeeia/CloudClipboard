# Typography Rules

## Core Principle

Typography should create clear hierarchy through size, weight, and color — not through random choices.

## Type Scale

```
Display        32-48px    — page hero, major sections
Title          20-24px    — page titles, section headers
Heading        16-18px    — card titles, sub-headers
Body           14-16px    — primary content
Secondary      12-13px    — supporting text, captions
Caption        11px       — labels, timestamps, meta
```

## Hierarchy Rules

1. **Size establishes hierarchy** — Larger = more important
2. **Weight supplements** — Use 500-600 for emphasis, not bigger sizes
3. **Color adds depth** — Primary / Secondary / Tertiary text colors
4. **Line height** — Body: 1.5, Headings: 1.2-1.4
5. **Max width** — Body text should not exceed ~70 characters per line

## Good Typography

```css
.title {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.body {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--text-secondary);
}

.label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
}
```

## Bad Typography

```css
/* Random sizes, no hierarchy */
.text1 { font-size: 17px; }
.text2 { font-size: 13px; }

/* Inconsistent weights */
.bold-here { font-weight: 700; }
.slightly-bold { font-weight: 600; }

/* Poor line height */
.body { line-height: 1.1; }
```

## Optical Adjustments

- **Letter-spacing** — Negative for headings (-0.01em to -0.02em), positive for uppercase labels
- **Baseline alignment** — Text should align visually with adjacent elements
- **Mixed content** — Numbers, units, and labels should maintain consistent baseline

## Font Stack

```css
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
  "PingFang SC", "Helvetica Neue", "Segoe UI", Roboto, sans-serif;
--font-mono: "SF Mono", ui-monospace, "JetBrains Mono", Menlo, Monaco, monospace;
```
