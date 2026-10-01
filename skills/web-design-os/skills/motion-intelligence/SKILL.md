---
name: motion-intelligence
version: 1.2.0
description: Design purposeful UI motion with appropriate timing, easing, continuity, interruption behavior, and accessibility.
---

# Motion Intelligence

Motion explains change.

## First question

Before animating ask:

> What information does this movement communicate?

If the answer is “nothing”, do not animate it.

## Motion purposes

Use motion for:

- feedback
- hierarchy
- continuity
- spatial orientation
- cause and effect
- progressive disclosure

Avoid motion that delays task completion.

## Properties

Prefer animating performant properties:

- transform
- opacity

Use layout animation intentionally and test performance.

## Timing guidance

- micro feedback: short and immediate
- local state transitions: quick
- spatial transitions: slightly longer when distance/context requires it
- never use duration as a substitute for clarity

Choose timing based on perceived distance and importance, not arbitrary numbers.

## Easing

Use:

- responsive easing for direct UI feedback
- spring behavior when physical continuity is useful
- restrained curves for productivity interfaces

Avoid exaggerated bounce unless it communicates product personality intentionally.

## Interruption

Motion must not assume the user waits.

Consider:

- repeated clicks
- navigation during transition
- drag interruption
- async state changes during animation

The latest meaningful user intent should generally win.

## Reduced motion

Provide an equivalent state change with less movement.

## Review questions

- Does the animation explain something?
- Is the destination more important than the journey?
- Does it feel responsive?
- Can it be interrupted?
- Does it preserve context?
- Does reduced motion remain understandable?
