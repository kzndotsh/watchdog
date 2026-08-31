# UI: motion (Operate)

This page defines motion budgets for high-frequency Operate surfaces.

## Tokens

Defined in `apps/web/src/styles/wd-tokens.css`:

| Token              | Value | Use                                    |
| ------------------ | ----- | -------------------------------------- |
| `--duration-fast`  | 100ms | Queue select, Detail swap (color-only) |
| `--duration-panel` | 180ms | Panels, dialogs                        |

## Motion (Operate)

- High-frequency paths (Queue select, Detail swap): instant or ≤100ms and **color-only** (`--duration-fast`)
- Panels/dialogs: ≤100-180ms (`--duration-panel`). Do not use page-mount fades, staggered or blur entrances, or AnimatePresence on Queue/Detail.
- Use an amber wash/bar for selection, not pulse.
- Button press `scale(0.97)` OK; no bounce/elastic
- Infinite pulse: skeletons (gated by reduced-motion) or StatusDot `running` only: not live badges generally
