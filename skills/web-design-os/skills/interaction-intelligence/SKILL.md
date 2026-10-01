---
name: interaction-intelligence
version: 1.2.0
description: Design high-quality user interactions with clear feedback, state continuity, direct manipulation, accessibility, and reduced-motion support.
---

# Interaction Intelligence

Design what happens when the user acts.

## Core principle

Every interaction should make clear:

1. What action occurred?
2. What is happening now?
3. What changed?
4. What can happen next?

## Interaction model

`Intent → Action → Immediate Feedback → Processing State → Result → Next Action`

## State design

For interactive controls, explicitly consider:

- idle
- hover
- focus-visible
- pressed
- disabled
- loading
- success
- error

Do not hide meaningful processing states.

## Feedback

Feedback should be proportional:

- Small action → small response.
- Important transition → stronger contextual feedback.
- Destructive action → confirmation or undo when appropriate.
- Async action → immediate acknowledgement plus progress/state.

## Continuity

Prefer:

- preserved context
- shared elements
- stable spatial relationships
- progressive disclosure

Avoid replacing the entire screen when only one region changed.

## Direct manipulation

For drag, resize, sliders, sortable content:

- movement should track user input directly
- provide a clear active state
- preserve control of interruption
- communicate valid and invalid targets
- avoid laggy or decorative inertia

## Keyboard and focus

Every essential interaction must work without a pointer.

- use visible focus indicators
- preserve logical focus after dialogs
- support Escape where expected
- avoid keyboard traps

## Reduced motion

When `prefers-reduced-motion: reduce` is active:

- remove non-essential movement
- preserve state clarity
- replace spatial movement with opacity or instant state changes when appropriate

## Decision checklist

Before implementation ask:

- What user intent is being served?
- What feedback is required immediately?
- What states can occur?
- Can the interaction be interrupted?
- What happens on failure?
- What happens with keyboard input?
- What changes under reduced motion?

## Completion criteria

An interaction is complete only when:

- state changes are understandable
- async states are visible
- failure is recoverable
- keyboard behavior works
- reduced motion is respected
