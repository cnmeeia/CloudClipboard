# Sona UI Provider

## Role

Sona UI is an interaction component provider.

Use it when the interface benefits from:

- fluid controls
- tactile feedback
- premium interaction primitives
- advanced motion behavior

## Provider rules

1. Inspect existing project components first.
2. Identify the interaction problem.
3. Select the smallest primitive that solves it.
4. Avoid importing effects purely for visual novelty.
5. Validate keyboard behavior and reduced motion.
6. Keep ownership and maintainability of installed code.

## Good candidates

- magnetic interaction
- fluid tabs
- tactile switches
- expressive sliders
- controlled visual effects

## Avoid

- animating every control
- stacking multiple competing effects
- replacing accessible primitives with visual-only implementations
