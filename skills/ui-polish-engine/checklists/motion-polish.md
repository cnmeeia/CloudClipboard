# Motion Polish Checklist

## Transitions

- [ ] No `transition: all .3s ease` anywhere
- [ ] All transitions are property-specific
- [ ] Transition durations use motion tokens
- [ ] Transition easing uses easing tokens
- [ ] Hover states use fast duration (140ms)
- [ ] Card animations use normal duration (200ms)
- [ ] Panels use slow duration (320ms+)
- [ ] Modals use slower duration (480ms+)

## Spring Physics

- [ ] Dragging uses spring physics
- [ ] Expanding panels use spring physics
- [ ] Interactive buttons use spring physics
- [ ] Cards use spring for hover
- [ ] Floating controls use spring
- [ ] Opacity/color/background use easing, not spring
- [ ] No excessive bounce

## Motion Hierarchy

- [ ] Different component types animate at different speeds
- [ ] Micro interactions are fast (120–180ms)
- [ ] Components are normal (160–220ms)
- [ ] Panels are slow (250–400ms)
- [ ] Modals are slower (300–500ms)
- [ ] Pages are slowest (400–600ms)

## Animation Meaning

- [ ] Every animation answers: What changed? Why?
- [ ] Enter/exit transitions exist for popovers and modals
- [ ] No decorative animation without interaction meaning
- [ ] Cards animate on hover with lift + shadow
- [ ] States change smoothly (loading → loaded)

## Reduced Motion

- [ ] `prefers-reduced-motion` media query implemented
- [ ] All animation/transition durations set to ~0
- [ ] Scroll behavior set to auto
- [ ] No infinite animations without reduced motion fallback

## Performance

- [ ] No animating `all` properties
- [ ] Animate only transform and opacity for high-frequency animations
- [ ] Avoid animating layout properties (width, height, margin)
- [ ] Backdrop-filter blur values are mobile-friendly

## Feel

- [ ] Motion feels natural
- [ ] Motion feels calm
- [ ] Motion communicates hierarchy
- [ ] Nothing animates unnecessarily
- [ ] UI feels responsive
- [ ] Physics feel believable
