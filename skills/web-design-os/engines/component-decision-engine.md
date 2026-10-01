# Component Decision Engine

```text
Need identified
↓
Does the project already contain a suitable component?
├─ Yes → reuse/adapt it
└─ No
   ↓
Is this a foundational UI primitive?
├─ Yes → evaluate shadcn/ui or existing primitives
└─ No
   ↓
Is the main requirement interaction/motion quality?
├─ Yes → evaluate Sona UI
└─ No
   ↓
Can a small custom component solve it more cleanly?
├─ Yes → build custom
└─ No → research a trusted provider
```

Choose the option with the best balance of:
- accessibility
- consistency
- dependency cost
- maintainability
- implementation complexity
