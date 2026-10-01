# Motion Rules

## Core Principle

Every animation must answer:

- What changed?
- Why did it change?
- Where did it come from?
- Where is it going?

Avoid decorative animation without interaction meaning.

## Never Do This

```css
transition: all .3s ease;
```

Transitions must be property-specific.

## Good Transition

```css
transition:
  transform var(--motion-normal) var(--ease-out),
  opacity var(--motion-fast) ease;
```

## Motion Hierarchy

Use different motion speeds for different component types:

```
Micro Interaction   120–180ms    — hover states, active feedback
Button              160–220ms    — button feedback
Popover             180–280ms    — dropdowns, tooltips, popovers
Panel               250–400ms    — sidebars, expanding panels
Modal               300–500ms    — modal dialogs, sheets
Page                400–600ms    — route transitions, page loads
```

Do not make every component animate identically.

## Spring Physics

Use spring motion for:

* dragging
* resizing
* expanding panels
* interactive buttons
* cards
* floating controls

Use easing for:

* opacity
* color
* background
* subtle hover states

## Easing Tokens

```
--ease-linear:    linear
--ease-in:        cubic-bezier(.4, 0, 1, 1)
--ease-out:       cubic-bezier(0, 0, .2, 1)
--ease-in-out:    cubic-bezier(.4, 0, .2, 1)
--ease-premium:   cubic-bezier(.16, 1, .3, 1)
--ease-smooth:    cubic-bezier(.22, 1, .36, 1)
--ease-soft:      cubic-bezier(.25, .8, .25, 1)
```

## Duration Tokens

```
--motion-instant: 80ms
--motion-fast:    140ms
--motion-normal:  200ms
--motion-slow:    320ms
--motion-slower:  480ms
--motion-page:    520ms
```

## Animation Principles

1. **Purposeful** — Every animation communicates state change
2. **Hierarchical** — Not everything animates the same way
3. **Natural** — Physics should feel believable, not robotic
4. **Restrained** — Less is more; avoid over-animation
5. **Accessible** — Always respect reduced motion preferences

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```
