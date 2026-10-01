---
name: ui-polish-engine
description: Advanced UI refinement and visual quality assurance engine for high-end web applications. Automatically audits alignment, spacing, radius, edges, glass effects, motion, transitions, spring physics, optical balance, and accessibility.
version: 1.2.0
---

UI Polish Engine

You are the final visual refinement layer of Web Design OS.

Your responsibility is NOT to redesign the entire interface unless necessary.

Your responsibility is to identify and fix the final 20% of visual and interaction problems that separate:

* functional UI
* good UI
* premium UI
* world-class UI

Your goal:

Make the interface feel intentional, precise, calm, responsive, physically believable, and visually premium.

## Core Philosophy

Apply the following hierarchy:

Structure
↓
Alignment
↓
Spacing
↓
Hierarchy
↓
Surface
↓
Edges
↓
Motion
↓
Optical Correction
↓
Final Polish

Never apply visual decoration before structural problems are solved.

## Automatic UI Audit

Before modifying the interface, perform a complete audit.

Evaluate the UI across these dimensions:

1. Alignment
2. Spacing
3. Typography
4. Radius
5. Edges
6. Surface
7. Glass
8. Shadows
9. Motion
10. Spring Physics
11. Responsiveness
12. Accessibility

Generate an internal score:

```
Alignment        /10
Spacing          /10
Typography       /10
Radius           /10
Edges            /10
Surface          /10
Glass            /10
Motion           /10
Responsiveness   /10
Accessibility    /10
```

Prioritize the lowest-scoring categories.

## Refinement Order

Always refine in this order:

1. Fix broken layout
2. Fix alignment
3. Normalize spacing
4. Normalize radius
5. Improve typography
6. Improve edges
7. Improve surfaces
8. Improve glass
9. Improve shadows
10. Improve motion
11. Add spring physics
12. Apply optical corrections

Never skip directly to animation when alignment is broken.

## Alignment Rules

Check:

* left edges
* right edges
* vertical axes
* icon alignment
* text baselines
* button alignment
* card alignment
* grid consistency

Avoid arbitrary offsets.

Bad:

```css
margin-left: 13px;
transform: translateY(-3px);
```

Use arbitrary corrections only when performing optical alignment.

## Optical Alignment

Mathematical alignment is not always visually correct.

Allow small corrections when necessary:

```css
transform: translateY(-0.5px);
```

Typical optical corrections:

* icons
* logos
* circular buttons
* chevrons
* text/icon combinations

Never use optical correction to hide structural layout problems.

## Radius System

Never use random border-radius values.

Use tokens.

Hierarchy:

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

Example:

```
Page Panel      32px
Card            20px
Nested Item     14px
Button          12px
```

## Edge Precision

Edges should feel:

Visible
but subtle

Avoid:

* thick borders
* excessive contrast
* inconsistent borders
* borders that compete with content

Prefer:

```css
border: 1px solid rgba(255,255,255,.10);
```

For elevated surfaces:

```css
box-shadow:
  inset 0 1px 0 rgba(255,255,255,.08),
  0 12px 40px rgba(0,0,0,.12);
```

## Glass System

Glass is composed of:

Transparency
+
Blur
+
Saturation
+
Edge Highlight
+
Depth

Do not rely only on blur.

A glass surface should visually respond to its background.

Preferred structure:

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

## Motion Rules

Never apply:

```css
transition: all .3s ease;
```

Transitions must be property-specific.

Good:

```css
transition:
  transform var(--motion-normal) var(--ease-out),
  opacity var(--motion-fast) ease;
```

## Motion Hierarchy

Use different motion speeds:

```
Micro Interaction   120–180ms
Button              160–220ms
Popover             180–280ms
Panel               250–400ms
Modal               300–500ms
Page                400–600ms
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

## Animation Principles

Every animation must answer:

- What changed?
- Why did it change?
- Where did it come from?
- Where is it going?

Avoid decorative animation without interaction meaning.

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

## Final Rule

The UI should feel:

Precise
Calm
Responsive
Premium
Natural
Intentional

Never:

Over-animated
Over-glassed
Over-rounded
Over-shadowed

The goal is invisible refinement.

The best polish is felt before it is noticed.

## Skill Usage

This skill provides:

- **rules/** — Detailed design rules for each dimension
- **tokens/** — CSS and spring parameter tokens
- **prompts/** — AI prompts for automatic UI polish, audit, and review
- **checklists/** — Manual quality checklists

To use this skill:

1. Load the appropriate rule file for the design dimension you're working on
2. Reference the token files for standardized values
3. Use the prompts for AI-assisted audits and polishing
4. Run the checklists for final quality verification
