# DESIGN: interface direction

**What this is:** the one-page design brief for the web app: the few opinions every UI rule traces back to. Draft 2026-09-29, written to be edited: change a line here first, then the rules that follow from it ([`reference/web/ui/rules.md`](../reference/web/ui/rules.md)).  
**What this is not:** tokens or component APIs ([`reference/web/UI.md`](../reference/web/UI.md)) or product intent ([`product.md`](product.md)).

## Direction

Watchdog is an operator's tool for long investigation sessions. It should read **dense, quiet, and exact**: an investigator keeps their place across Queue, Detail, Dossier, and Graph without the chrome competing with the evidence. Orientation first (which Case, which row, what state), then the one command that matters in that scope.

Anti-references: generic SaaS dashboards, decorative AI gradients and glow, terminal cosplay, card-per-row stacks.

## Color

- OKLCH everywhere. Neutrals are lightly tinted (cool, hue ~250), never pure gray; dark mode is charcoal, not black.
- One accent: steel-cyan (hue ~220) for primary actions, focus, and live state. One signal: amber (hue ~75) for selection and "needs you".
- Status and domain meaning come from tokens (`--status-*`, `--confidence-*`, `--kind-*`), never raw palette classes.
- **Status is never color-only.** Every status has its own glyph shape; color reinforces it.

## Surfaces

- Flat. Cards match the page; separation comes from borders, alignment, and whitespace, not elevation.
- Panel-first layouts: Queue + Detail splits, tables, stacks. No nested cards, no floating section cards.
- Radius: small (3 / 6 / 9px). Nothing pill-shaped except chips and dots.

## Type

- Geist for UI, Geist Mono for ids, hashes, paths, and counts. Mono carries data, never decoration.
- Compact, fixed sizes (roles in `wd-typography.css`); counts use tabular numerals.

## Interaction

- **Keyboard first on work surfaces.** `j` / `k` move through any Queue; single-key actions (`a` Accept, `r` Reject) sit on the buttons that own them and show their key; Enter confirms dialogs; Mod+K reaches every page and page command.
- Selection is an amber wash. A thin left bar means state (a live job), not decoration.
- Stable dimensions: headers, rows, and controls don't change size when labels, counts, or loading states change.

## Motion

Short and functional: ≤100ms on rows, ≤180ms on dialogs. No page fades, staggers, or bounce. The only continuous motion is a skeleton pulse and a running status spin, and reduced motion stops both.

## Responsive

Desktop is the primary scene. Below 768px a split shows one column at a time (Queue, then Detail with a back control). Coarse pointers get larger targets; desktop density doesn't change for them.

## Accessibility

WCAG 2.2 AA in both themes. Visible focus everywhere; every icon-only control has a name; status readable without color; reduced motion loses no meaning.
