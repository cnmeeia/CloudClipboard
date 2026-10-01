# Edge Precision Rules

## Core Principle

Edges should feel:

Visible but subtle

## Avoid

* thick borders
* excessive contrast
* inconsistent borders
* borders that compete with content

## Preferred Border

```css
border: 1px solid rgba(255,255,255,.10);
```

For dark mode:

```css
border: 1px solid rgba(255,255,255,.08);
```

## Elevated Surfaces

```css
box-shadow:
  inset 0 1px 0 rgba(255,255,255,.08),
  0 12px 40px rgba(0,0,0,.12);
```

## Edge Quality Checklist

- [ ] Hairline borders are 1px, never thicker
- [ ] Border color uses rgba with low opacity, not solid colors
- [ ] Elevated surfaces include an inset top highlight
- [ ] Card separation relies on shadow + border combination
- [ ] No borders compete with content for attention
- [ ] Consistent border treatment across all cards/surfaces

## Bad Edge Patterns

```css
/* Too thick */
border: 2px solid #ddd;

/* Too strong */
border: 1px solid #000;

/* Inconsistent */
.card1 { border: 1px solid rgba(0,0,0,.1); }
.card2 { border: 1px solid rgba(0,0,0,.2); }
```

## Good Edge Patterns

```css
/* Subtle hairline */
border: 1px solid rgba(255,255,255,.10);

/* With inner highlight for elevation */
box-shadow:
  inset 0 1px 0 rgba(255,255,255,.08),
  0 8px 24px rgba(0,0,0,.08);
```

## Shadow Hierarchy

```
Level 1  — Resting:      0 1px 2px rgba(0,0,0,.04)
Level 2  — Elevated:     0 4px 16px rgba(0,0,0,.08)
Level 3  — Floating:     0 8px 32px rgba(0,0,0,.1)
Level 4  — Modal/Overlay: 0 12px 40px rgba(0,0,0,.14)
```
