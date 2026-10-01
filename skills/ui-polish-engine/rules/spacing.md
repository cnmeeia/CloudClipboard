# Spacing System Rules

## Core Principle

Use a consistent, token-based spacing scale. Never use arbitrary values.

## Standard Scale

```
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
```

## Spacing Hierarchy

```
Micro Gap        4px     — icon/text, inline elements
Tight Gap        8px     — related elements, form controls
Base Gap         12px    — label/input, button groups
Comfort Gap      16px    — card internal padding
Section Gap      24px    — between cards/sections
Page Gap         32px+   — between major page sections
```

## Rules

1. **Token-based** — Never use arbitrary px values for margins/padding
2. **Consistent rhythm** — Related elements should share consistent gaps
3. **Padding > Margin** — Prefer padding on containers over margins between elements
4. **Whitespace balance** — Do not overcrowd or over-pad; find the right breathing room
5. **Responsive scaling** — Spacing can scale up on desktop, down on mobile

## Bad Spacing

```css
margin-top: 17px;      /* off-scale */
padding: 9px 14px;     /* non-token values */
gap: 22px;             /* not in scale */
```

## Good Spacing

```css
margin-top: var(--space-4);   /* 16px */
padding: var(--space-2) var(--space-4);  /* 8px 16px */
gap: var(--space-3);          /* 12px */
```

## Optical Whitespace

- Whitespace should create visual grouping (Gestalt proximity principle)
- More whitespace for emphasis, less for density
- Consistent padding rhythm across cards
- Avoid touching elements or excessive gaps that break visual connection
