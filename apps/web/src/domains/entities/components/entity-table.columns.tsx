/* oxlint-disable react/only-export-components -- column factory for EntityTable */
import type {
  CellContext,
  ColumnDef,
  FilterFn,
  HeaderContext,
} from "@tanstack/react-table";

import { EntityConnectionsCell } from "@/domains/entities/components/entity-connections-cell";
import type { EntityConnectionPeer } from "@/domains/entities/lib/connection-peers";
import type {
  CreateEntityConnectionInput,
  UpdateEntityConnectionInput,
} from "@/domains/entities/lib/edge-write";
import type { EntityRecord } from "@/domains/entities/types";
import {
  DataTableColumnHeader,
  EditableSelectCell,
  EditableTextCell,
} from "@/shared/ui/data-table";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { NotesIconCell } from "@/shared/ui/identifiers/identifier-notes-cell";
import { formatRelativeTime } from "@/shared/ui/relative-time.lib";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/ui/shadcn/dropdown-menu";
import { WithTooltip } from "@/shared/ui/timestamp";
import { ENTITY_KIND_OPTIONS, EntityKindGlyph } from "@/shared/ui/vocab";
import { entityKindSchema, type EntityKind } from "@watchdog/schemas";

export const entityGlobalFilterFn: FilterFn<EntityRecord> = (
  row,
  _id,
  filterValue
) => {
  const q = String(filterValue ?? "")
    .toLowerCase()
    .trim();
  if (!q) return true;
  const e = row.original;
  return (
    e.name.toLowerCase().includes(q) ||
    e.slug.toLowerCase().includes(q) ||
    e.kind.toLowerCase().includes(q) ||
    (e.summary ?? "").toLowerCase().includes(q) ||
    (e.notes ?? "").toLowerCase().includes(q)
  );
};

export interface EntityTableMeta {
  updateKind: (entityId: string, kind: EntityKind) => void;
  updateSummary: (entityId: string, summary: string) => void;
  updateNotes: (entityId: string, notes: string) => void;
  peersByEntityId: ReadonlyMap<string, readonly EntityConnectionPeer[]>;
  entityOptions: readonly EntityOption[];
  createConnection: (
    centerId: string,
    input: CreateEntityConnectionInput
  ) => Promise<void>;
  updateConnection: (
    centerId: string,
    input: UpdateEntityConnectionInput
  ) => Promise<void>;
  onOpenEntity: (entity: EntityRecord) => void;
  onCopyEntityLink: (entity: EntityRecord) => void;
  onCopyEntityMarkdown: (entity: EntityRecord) => void;
  onDeleteEntity: (entity: EntityRecord) => void;
}

function entityMeta(
  ctx: Pick<CellContext<EntityRecord, unknown>, "table">
): EntityTableMeta {
  return ctx.table.options.meta as EntityTableMeta;
}

function arrayIncludesFilter(value: unknown, cell: string): boolean {
  if (!Array.isArray(value) || value.length === 0) return true;
  return value.includes(cell);
}

function filterByKind(
  row: { original: EntityRecord },
  _id: string,
  value: unknown
): boolean {
  return arrayIncludesFilter(value, row.original.kind);
}

function nameColumnHeader({ column }: HeaderContext<EntityRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Name" />;
}

function kindColumnHeader({ column }: HeaderContext<EntityRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Kind" />;
}

function summaryColumnHeader({ column }: HeaderContext<EntityRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Summary" />;
}

function connectionsColumnHeader({
  column,
}: HeaderContext<EntityRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Connections" />;
}

function updatedColumnHeader({ column }: HeaderContext<EntityRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Updated" />;
}

function notesColumnHeader({ column }: HeaderContext<EntityRecord, unknown>) {
  return (
    <DataTableColumnHeader
      column={column}
      title="Notes"
      className="flex w-full justify-center"
    />
  );
}

function formatFullLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  });
}

function renderNameCell(ctx: CellContext<EntityRecord, unknown>) {
  const row = ctx.row.original;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <EntityKindGlyph kind={row.kind} />
      <span className="block min-w-0 truncate text-sm font-medium">
        {row.name}
      </span>
    </div>
  );
}

function renderKindCell(ctx: CellContext<EntityRecord, unknown>) {
  const row = ctx.row.original;
  const meta = entityMeta(ctx);
  return (
    <EditableSelectCell
      value={row.kind}
      options={ENTITY_KIND_OPTIONS}
      aria-label="Entity kind"
      onCommit={(next) => {
        const kind = entityKindSchema.parse(next);
        if (kind === row.kind) return;
        meta.updateKind(row.id, kind);
      }}
    />
  );
}

function renderConnectionsCell(ctx: CellContext<EntityRecord, unknown>) {
  const row = ctx.row.original;
  const meta = entityMeta(ctx);
  return (
    <EntityConnectionsCell
      entity={row}
      peers={meta.peersByEntityId.get(row.id) ?? []}
      entityOptions={meta.entityOptions}
      onCreate={async (input) => meta.createConnection(row.id, input)}
      onUpdate={async (input) => meta.updateConnection(row.id, input)}
    />
  );
}

function renderSummaryCell(ctx: CellContext<EntityRecord, unknown>) {
  const row = ctx.row.original;
  const meta = entityMeta(ctx);
  return (
    <EditableTextCell
      value={row.summary ?? ""}
      placeholder="Summary…"
      aria-label="Summary"
      onCommit={(next) => {
        const trimmed = next.trim();
        if (trimmed === (row.summary ?? "")) return;
        meta.updateSummary(row.id, trimmed);
      }}
    />
  );
}

function renderNotesCell(ctx: CellContext<EntityRecord, unknown>) {
  const row = ctx.row.original;
  const meta = entityMeta(ctx);
  return (
    <NotesIconCell
      id={row.id}
      notes={row.notes}
      editorAriaLabel="Entity notes"
      saveNotes={(entityId, notes) => {
        meta.updateNotes(entityId, notes);
      }}
    />
  );
}

function renderUpdatedAtCell(ctx: CellContext<EntityRecord, unknown>) {
  const { updatedAt, createdAt } = ctx.row.original;
  if (!updatedAt) {
    return <span className="text-muted-foreground text-label-mono-sm">—</span>;
  }

  return (
    <WithTooltip
      wrapSpan
      content={
        <div className="flex flex-col gap-0.5 text-left">
          <span>Updated {formatFullLocalDateTime(updatedAt)}</span>
          <span>Created {formatFullLocalDateTime(createdAt)}</span>
        </div>
      }
    >
      <time
        dateTime={updatedAt}
        className="text-muted-foreground text-label-mono-sm cursor-default whitespace-nowrap tabular-nums"
      >
        <span suppressHydrationWarning>{formatRelativeTime(updatedAt)}</span>
      </time>
    </WithTooltip>
  );
}

function renderActionsCell(ctx: CellContext<EntityRecord, unknown>) {
  const row = ctx.row.original;
  const meta = entityMeta(ctx);
  return (
    <div className="flex justify-end">
      <RowActionsMenu label={`Actions for ${row.name}`}>
        <DropdownMenuItem
          onClick={() => {
            meta.onOpenEntity(row);
          }}
        >
          Open entity
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            meta.onCopyEntityLink(row);
          }}
        >
          Copy link
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            meta.onCopyEntityMarkdown(row);
          }}
        >
          Copy Markdown
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => {
            meta.onDeleteEntity(row);
          }}
        >
          Delete
        </DropdownMenuItem>
      </RowActionsMenu>
    </div>
  );
}

export const entityTableColumns: ColumnDef<EntityRecord>[] = [
  {
    accessorKey: "name",
    header: nameColumnHeader,
    cell: renderNameCell,
    meta: { label: "Name" },
    enableHiding: false,
    size: 150,
    minSize: 100,
  },
  {
    accessorKey: "kind",
    header: kindColumnHeader,
    cell: renderKindCell,
    filterFn: filterByKind,
    meta: { label: "Kind" },
    size: 100,
    minSize: 90,
  },
  {
    accessorKey: "summary",
    header: summaryColumnHeader,
    cell: renderSummaryCell,
    meta: { label: "Summary" },
    size: 280,
  },
  {
    id: "connections",
    header: connectionsColumnHeader,
    cell: renderConnectionsCell,
    enableSorting: false,
    meta: { label: "Connections" },
    size: 280,
    minSize: 200,
  },
  {
    accessorKey: "notes",
    header: notesColumnHeader,
    cell: renderNotesCell,
    enableSorting: false,
    meta: { label: "Notes" },
    size: 52,
    minSize: 48,
  },
  {
    accessorKey: "updatedAt",
    header: updatedColumnHeader,
    cell: renderUpdatedAtCell,
    meta: { label: "Updated" },
    size: 100,
    minSize: 90,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: renderActionsCell,
    enableSorting: false,
    enableHiding: false,
    meta: { label: "Actions" },
    size: 48,
    minSize: 48,
  },
];
