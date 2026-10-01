# Glass System Rules

## Core Principle

Glass is composed of:

```
Transparency
+
Blur
+
Saturation
+
Edge Highlight
+
Depth
```

Do not rely only on blur. A glass surface should visually respond to its background.

## Preferred Structure

```css
background:
  linear-gradient(
    135deg,
    rgba(255,255,255,.18),
    rgba(255,255,255,.06)
  );
backdrop-filter:
  blur(24px)
  saturate(160%);
-webkit-backdrop-filter:
  blur(24px)
  saturate(160%);
border:
  1px solid rgba(255,255,255,.14);
```

## Glass Application Rules

1. **Reserve glass for**: navigation, floating controls, overlays, premium panels
2. **Do NOT make every component glass** — over-glassing dilutes the effect
3. **Blur limits** — Avoid excessive blur (> 40px) which causes performance issues on mobile
4. **Saturation matters** — `saturate(140-180%)` helps glass surfaces pop against busy backgrounds
5. **Background response** — The glass surface should visibly react to content scrolling beneath it

## Bad Glass

```css
/* Blur only, no gradient */
background: rgba(255,255,255,.4);
backdrop-filter: blur(40px);

/* Too much blur */
backdrop-filter: blur(60px) saturate(200%);
```

## Good Glass

```css
/* Layered glass with depth */
background:
  linear-gradient(
    135deg,
    rgba(255,255,255,.18),
    rgba(255,255,255,.06)
  );
backdrop-filter:
  blur(24px)
  saturate(160%);
border: 1px solid rgba(255,255,255,.14);
box-shadow:
  inset 0 1px 0 rgba(255,255,255,.1),
  0 8px 32px rgba(0,0,0,.1);
```

## Mobile Performance

On mobile (especially iOS Safari), reduce blur for smooth scrolling:

```css
@media (max-width: 768px) {
  .glass {
    backdrop-filter: blur(16px) saturate(140%);
  }
}
```
