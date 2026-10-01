# Accessibility Rules

## Core Principle

Premium UI is accessible UI. Visual quality must never come at the expense of usability for all users.

## Color & Contrast

- Text contrast must meet WCAG AA: 4.5:1 for body text, 3:1 for large text
- UI component boundaries must have 3:1 contrast against adjacent colors
- Never rely on color alone to convey meaning

## Focus States

Always provide clear focus indicators:

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

## Reduced Motion

Always respect:

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

## Touch Targets

- Minimum interactive element size: 44×44px (mobile)
- Minimum 8px gap between adjacent touch targets
- Tap highlight should be removed for cleaner feel

## Semantic HTML

- Use semantic HTML elements (button, nav, main, aside, section)
- Buttons should be actual `<button>` elements, not divs
- Icon-only controls must have `aria-label` or visually hidden text

## Screen Reader

- Provide `aria-label` for icon buttons
- Use `role` attributes for custom components
- Announce dynamic content changes when appropriate
- Ensure proper `alt` text for images

## Keyboard Navigation

- All interactive elements must be keyboard accessible
- Tab order should follow visual order
- Escape closes overlays and modals
- Arrow keys navigate lists and menus

## Typography Accessibility

- Line height ≥ 1.5 for body text
- Avoid justified text (creates uneven word spacing)
- Allow text to resize (no fixed font sizes in px for body text)
- Do not use `user-select: none` on content that should be selectable

## Motion & Seizure Safety

- Avoid flashing content (more than 3 flashes per second)
- No rapid zoom or scale animations
- No full-screen parallax that can cause motion sickness
