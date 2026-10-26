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
| `isPending={listPending(query)}` on `DataTable` | `PendingRegion` on a table body |
| One skeleton bar per cell under the mounted header (built into `DataTable`) | `TableBodySkeletonLayout` in production table paths |
| `pendingLabel` for screen readers (`aria-busy` on the wrapper) | Hoist `<tr>` skeletons inside a single `<td>` |

Surfaces: `/cases/$caseSlug/entities` (`listPending`) and `/cases/$caseSlug/identifiers` (`ListTable`, which passes `isPending` from the list's status). Loading doctrine: [`loading.md`](loading.md).

## Server mode (declared lists)

A declared list's table runs TanStack Table in server mode (the Identifiers table and the Dossier Identifiers tab; how to add one: [`lists.md`](../lists.md)): `useListTable(list, { columns, sortColumns, display })` (`shared/hooks/list/use-list-table.ts`) builds it on `serverTableFeatures` (sorting state, visibility, sizing, selection; no sorted, filtered or paginated row model), with `manualSorting`, `getRowId` from the view, and sorting enabled only on the columns `sortColumns` maps to a declared sort, so a header can only offer an indexed sort. `ListTable` renders it through `DataTable`, which puts `aria-sort` on every sortable header. There is no client-mode table: `useDataTable`, `boundedTableFeatures`, `DataTablePagination` and `DataTableViewOptions` were deleted with the last whole-list reads (#573), because the bounded lists (Settings credentials, the Library catalog, Vault) are not tables that sort, filter or page in the browser. Importing a client row model or filter feature from `@tanstack/react-table` is a lint error (`conventions.md`); a bounded table that needs one adds it in `shared/ui/data-table/table-features.ts` with a named exemption in `oxlint.config.ts`.

## Gotchas

- **The skeleton is in the server HTML:** `DataTable` renders `isPending` as is, with no hydration gate. `listPending` is true on the server (nothing is fetched there) and on the first client render, so both agree; gating the skeleton behind hydration painted the empty text ("No entities yet") on every refresh until the JS arrived. Tests: `table-pages-loading.component.test.tsx` (Entities, Identifiers) and `data-table.component.test.tsx`.

- **Connections cell (Entities):** chips, Add, and `+N` must be buttons (not links) so full-row dossier navigation still works. `+N` opens browse, not create. The popover should be `modal` so clicks don't fall through to the row. Scope `isSaving` to the open cell: a table-wide busy flag remounts columns. Prefer the popover `FieldError` over also toasting the same failure. Payload builders live in `entities/lib/edge-write.ts`, shared with the Dossier.
- **Row actions and options reach cells through a typed context (cells remount otherwise):** never pass actions as `table.options.meta` and cast them back, and never build the columns from the actions. `flexRender` renders a function `cell` as a React component, so a cell function created per actions object is a new component type to React: every refetch that changes the actions (peers, connections, options) would remount each cell and drop an open draft or popover. The column defs (`entityTableColumns`, `identifiersTableColumns`, `dossierIdentifierColumns`) are module constants whose cells are module-level components; each reads its table's typed `*TableActions` with `useEntityTableActions()` / `useIdentifiersTableActions()` / `useIdentifierTableActions()` (made by `createTableActionsContext`, `shared/ui/data-table/table-actions-context.ts`; a cell outside the provider throws). The component that owns the actions (`entity-table.tsx`, `identifiers-page.tsx`, the Dossier `identifiers-section.tsx`) wraps its `DataTable` in the matching `*TableActionsProvider`, with the object its state hook memoizes. Changed actions re-render the consumer cells with new props, which also reaches rows React Compiler memoized. Data a cell shows belongs in the row, from the server: the Entities table's rows are `EntityListItem` (the Entity plus its Connection counts and, when it has exactly one, that Connection: `connections`, `soleConnection`, joined by `entityListRepo`), so linking or unlinking refreshes the list page and the Connections cell reads the new row; the full Connection list is the Entity's own read, made only while the cell's popover lists it. Per-column `meta: { label }` stays: the header and view options read it. The provider's `value` is typed, so a table that passes the wrong shape does not compile (`table-actions-context.component.test.tsx`, with an `@ts-expect-error`).
- **`onRowClick`:** arm on pointerdown and ignore leftover clicks after a portaled Combobox or Select unmounts (a platform pick must not navigate). Keep interactive cells as real `a` / `button` / `input` / `select`. `EditableSuggestCell` selection is uncontrolled so a pick does not snap back to the stale saved value.
- **Actions column:** trailing ~48px; the `RowActionsMenu` trigger stays a `button` (row-click ignore list). Body rows carry `group` so hover-reveal works. Delete goes last and separated. Prefer `actions={...}` from a shared factory (`entityRowActions`, `identifierRowActions`) so the menu and the row ContextMenu stay aligned. Target actions only; don't layer inset chrome onto row menus.
- **Row ContextMenu:** optional `getRowActions` wraps each body `<tr>` in `ActionsContextMenu`. A capture-phase `stopPropagation` on editable targets (`isEditableTarget`) keeps native copy and paste. The innermost trigger wins under the inset page fallback.
- **Identifiers table** lives under `entities/` (`identifiers-page.tsx` + `use-identifiers-table.ts`), not `cases/`. Evidence create and edit use `shared/ui/identifiers/identifier-composer.tsx` and `identifier-evidence-cell.tsx`; notes use `identifier-notes-cell.tsx`, built on `notes-icon-cell.tsx` (`NotesIconCell` opens a Sheet with `RichTextEditor`), which `/entities` reuses for entity notes.
