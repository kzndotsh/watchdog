# UI: tables

The column-sizing and pending contract for `DataTable`. Both are `guidance`: nothing fails a column without `size` or a `PendingRegion` on a table body.

## Table columns

`DataTable` uses `table-layout: fixed`, `width: 100%`, and a `<colgroup>` derived from TanStack `column.size` (a percentage of the sum). A column with no `size` falls back to TanStack's default 150 and shares leftover equally; pinning some `th`/`td` with `w-*` and leaving others open dumps the leftover on the open column.

| Do | Don't |
| --- | --- |
| Set `size` (and `minSize` on enums) on every column | Rely on the default 150 |
| Size enums to the longest label plus cell chrome (~140 for Status / "In Progress") | `w-24` on a select cell |
| Give leftover to the fluid text column via a larger `size` (Title, Value, Name) | Leave the first or last column unconstrained |
| `min-w-0 overflow-hidden` on cells; truncate in the cell | Let `min-width: auto` fight the colgroup |
| Raw preview tables: same `<colgroup>` percentages summing to 100% | Widths only on `<th>` |

Surfaces: Entities (`entity-table.columns.tsx`), Identifiers (`identifiers-table.columns.tsx` + `shared/ui/identifiers/identifier-cells.tsx`), and the bulk-add preview (`PREVIEW_COLUMNS`). Queues, boards, and ColumnMapper grids are not tables.

## Tables

Flex skeleton overlays cannot align with column headers: you get blank carrier rows and shifted bars.

| Do | Don't |
| --- | --- |
| `pending={listPending(query)}` on `DataTable` | `PendingRegion` on a table body |
| One skeleton bar per cell under the mounted header (built into `DataTable`) | `TableBodySkeletonLayout` in production table paths |
| `pendingLabel` for screen readers (`aria-busy` on the wrapper) | Hoist `<tr>` skeletons inside a single `<td>` |

Surfaces: `/entities` and `/identifiers`. Loading doctrine: [`loading.md`](loading.md).

## Gotchas

- **Connections cell (Entities):** chips, Add, and `+N` must be buttons (not links) so full-row dossier navigation still works. `+N` opens browse, not create. The popover should be `modal` so clicks don't fall through to the row. Scope `saving` to the open cell: a table-wide busy flag remounts columns. Prefer the popover `FieldError` over also toasting the same failure. Payload builders live in `entities/lib/edge-write.ts`, shared with the Dossier.
- **`onRowClick`:** arm on pointerdown and ignore leftover clicks after a portaled Combobox or Select unmounts (a platform pick must not navigate). Keep interactive cells as real `a` / `button` / `input` / `select`. `EditableSuggestCell` selection is uncontrolled so a pick does not snap back to the stale saved value.
- **Actions column:** trailing ~48px; the `RowActionsMenu` trigger stays a `button` (row-click ignore list). Body rows carry `group` so hover-reveal works. Delete goes last and separated. Prefer `actions={...}` from a shared factory (`entityRowActions`, `identifierRowActions`) so the menu and the row ContextMenu stay aligned. Target actions only; don't layer inset chrome onto row menus.
- **Row ContextMenu:** optional `getRowActions` wraps each body `<tr>` in `ActionsContextMenu`. A capture-phase `stopPropagation` on editable targets (`isEditableTarget`) keeps native copy and paste. The innermost trigger wins under the inset page fallback.
- **Identifiers table** lives under `entities/` (`identifiers-page.tsx` + `use-identifiers-table.ts`), not `cases/`. Evidence create and edit use `shared/ui/identifiers/identifier-composer.tsx` and `identifier-evidence-cell.tsx`; notes use `identifier-notes-cell.tsx` (`NotesIconCell` opens a Sheet with `RichTextEditor`), which `/entities` reuses for entity notes.
