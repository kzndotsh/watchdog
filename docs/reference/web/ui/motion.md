# UI — motion (Operate)

**What this is:** motion budgets for high-frequency Operate surfaces.

## Motion (Operate)

- High-frequency paths (Queue select, Detail swap): instant or ≤100ms **color-only** (`--duration-fast`)
- Panels/dialogs: ≤100–180ms (`--duration-panel`); no page-mount fades, stagger, blur entrances, or AnimatePresence on Queue/Detail
- Selection = amber wash/bar — not pulse
- Button press `scale(0.97)` OK; no bounce/elastic
- Infinite pulse: skeletons (gated by reduced-motion) or StatusDot `running` only — not live badges generally
