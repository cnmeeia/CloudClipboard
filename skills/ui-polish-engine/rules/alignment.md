# Alignment Audit Rules

## Critical

Flag immediately:

* unrelated left edges
* inconsistent card widths
* broken grid columns
* buttons not aligned with their parent structure
* floating elements without intentional alignment

## Important

Check:

- Title Axis
- Content Axis
- Card Axis
- Button Axis
- Icon Axis

## Audit Questions

1. Do major elements share a common alignment axis?
2. Are repeated components aligned consistently?
3. Are icons visually centered?
4. Are text baselines consistent?
5. Does the layout feel balanced without arbitrary offsets?

## Automatic Fix Strategy

```
Detect misalignment
↓
Identify parent container
↓
Fix layout system
↓
Normalize spacing
↓
Apply optical correction only if necessary
```

## Optical Alignment

Mathematical alignment is not always visually correct. Small corrections are allowed:

```css
transform: translateY(-0.5px);
```

Typical optical corrections:
- icons
- logos
- circular buttons
- chevrons
- text/icon combinations

Never use optical correction to hide structural layout problems.
