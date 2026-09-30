# UI: motion (Operate)

This page defines motion budgets for high-frequency Operate surfaces.

## Tokens

Defined in `apps/web/src/styles/wd-tokens.css`:

| Token              | Value | Use                                   |
| ------------------ | ----- | ------------------------------------- |
| `--duration-fast`  | 100ms | Queue row hover / select (color-only) |
| `--duration-panel` | 180ms | Dialogs, sheets                       |

## Motion (Operate)

- High-frequency paths (Queue select, Detail swap): instant or ≤100ms and **color-only** (`--duration-fast`)
- Dialogs/sheets: ≤180ms (`--duration-panel`); menus/popovers keep the vendor ~75-100ms fade. Do not use page-mount fades, staggered or blur entrances, or AnimatePresence on Queue/Detail.
- Selection is an amber wash (`bg-signal/10`), not a pulse or a side bar. A thin left bar is reserved for **state** (live/running rows use `bg-status-running`).
- Button press is a 1px `translate-y` (vendor `active:` rule); no scale, bounce, or elastic
- Infinite motion: skeleton pulse (gated by reduced-motion) or the `running` StatusDot spin only: not live badges generally
