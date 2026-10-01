# Radius System Rules

## Core Principle

Never use random border-radius values. Use tokens.

## Hierarchy

```
Small Control
↓
Medium Component
↓
Card
↓
Panel
↓
Modal
```

Parent radius must normally be greater than child radius.

## Standard Values

```
Page Panel      32px
Card            20px
Nested Item     14px
Button          12px
```

## Rules

1. **Parent > Child** — Nested elements should have smaller radius than their container
2. **Consistency** — Repeated components must use identical radius values
3. **Token-based** — Never hardcode arbitrary radius values
4. **Semantic mapping** — Radius values should map to component types, not be arbitrary

## Bad Examples

```css
border-radius: 13px;   /* random, not token-based */
border-radius: 7px;    /* off-scale */
```

## Good Examples

```css
border-radius: var(--radius-sm);  /* 12px — buttons, inputs */
border-radius: var(--radius-md);  /* 16px — cards */
border-radius: var(--radius-lg);  /* 24px — panels, modals */
```

## Additional Considerations

- **Circular elements** — Use `border-radius: 999px` only for pills, avatars, toggles
- **Nested panels** — Maintain radius hierarchy consistently
- **Hover states** — Radius should not change on hover unless intentional
