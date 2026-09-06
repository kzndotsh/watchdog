# UI: tables

This page defines the column-sizing and DataTable pending contract.

## Table columns

`DataTable` uses `table-layout: fixed`, `width: 100%`, and a `<colgroup>` derived from TanStack `column.size` (a percentage of the sum). CSS gives leftover space to columns without a width, or spreads it across every column when widths do not fill the table. Do not pin some `th`/`td` cells with `w-*` and leave others open.

| Do | Don't |
| --- | --- |
| Set `size` (and `minSize` on enums) on every column | Rely on TanStack's default 150: equal leftover, no hierarchy |
| Size enums to the longest label + cell chrome (~140 for Status / "In Progress" / "unverified") | `w-24` on a select cell |
| Give leftover to the fluid text column via a larger `size` (Title / Value / Name) | Unconstrained first/last column |
| `min-w-0 overflow-hidden` on cells; truncate in the cell | Let `min-width: auto` fight the colgroup |
| Raw preview tables: same `<colgroup>` percentages that sum to 100% | Widths only on `<th>` |

Surfaces: Entities (`entity-table.columns.tsx`), Identifiers (`identifiers-table.columns.tsx` + dossier `identifiers-section.cells.tsx`), bulk-add preview (`PREVIEW_COLUMNS` in the dialog). Queues / boards / ColumnMapper grids are not tables.

## Tables

`DataTable` is `table-fixed` with a `<colgroup>` from TanStack `column.size`. Flex skeleton overlays **cannot align** with column headers: you get blank carrier rows and shifted bars.

| Do | Don't |
| --- | --- |
| `pending={listPending(query)}` on `DataTable` | `PendingRegion` on table bodies |
| One skeleton bar **per cell** under the mounted header (built into `DataTable`) | `TableBodySkeletonLayout` in production table paths |
| `pendingLabel` for screen readers (`aria-busy` on table wrapper) | Hoisting `<tr>` skeletons inside a single `<td>` |
| Every column defines `size` ([Table columns](#table-columns)) | Overlay skeleton in one `colSpan` cell |

Surfaces: `/entities`, `/identifiers` (`entity-table.tsx`, `identifiers-page.tsx`). Dossier Identifiers tab uses `useSuspenseQuery` inside the tab: parent Suspense, no `pending`. Full loading doctrine: [`loading.md`](loading.md).

## Gotchas

- **Entities Connections cell**: chips/Add/`+N` must be buttons (not links) so full-row dossier nav still works. `+N` opens browse, not create. Popover should be `modal` so clicks don't fall through to the row. Scope `saving` to the open cell: a table-wide busy flag remounts columns. Prefer popover `FormInlineError` over also toasting the same failure. Payload builders live in `entities/lib/edge-write.ts` (shared with dossier).
- **DataTable `onRowClick`**: arm on pointerdown; ignore leftover clicks after a portaled Combobox/Select unmounts (platform pick must not navigate). Keep interactive cells as real `a` / `button` / `input` / `select`. `EditableSuggestCell` selection is uncontrolled so a pick does not snap back to the stale saved value.
- **DataTable Actions column**: trailing ~48px; `RowActionsMenu` trigger stays a `button` (row-click ignore list). `DataTable` body rows include `group` so hover-reveal works. Delete last + separated. Prefer `actions={…}` from a shared factory (`entityRowActions` / `identifierRowActions`) so ⋯ and row ContextMenu stay aligned. Target actions only — do not layer inset chrome onto row menus.
- **DataTable row ContextMenu**: optional `getRowActions` wraps each body `<tr>` in Base UI ContextMenu (`ActionsContextMenu`). Capture-phase `stopPropagation` on editable targets (`isEditableTarget`) so native copy/paste survives. Nested under the inset page fallback: innermost trigger wins. Surfaces: `/entities`, `/identifiers`, Dossier Identifiers tab.
- **DataTable column widths**: kit is `table-fixed` + `<colgroup>` from `column.size`. A column with no `size` (TanStack default 150) shares leftover equally; a raw `<Table>` with `w-*` on some heads and none on others dumps leftover on the open column. Set `size` on every column; enums ~140. Contract: [Table columns](#table-columns).
- **DataTable loading**: `pending={listPending(...)}` + `pendingLabel`; kit renders per-cell skeleton rows under the mounted header. Never `PendingRegion` on table bodies (misaligned bars + empty carrier row). [Tables](#tables).
- **Identifiers table**: lives under `entities/` (`identifiers-page.tsx` + `use-identifiers-table.ts`), not `cases/`. Evidence create/edit uses `shared/ui/identifiers/identifier-composer.tsx` (Evidence column Link popover) and `identifier-evidence-cell.tsx` (row edit). Notes use `identifier-notes-cell.tsx` (`NotesIconCell` → Sheet + `RichTextEditor` Markdown); `/entities` reuses the same cell for entity notes.
