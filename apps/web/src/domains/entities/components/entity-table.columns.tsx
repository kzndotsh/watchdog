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
import { RelativeTime } from "@/shared/ui/relative-time";
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
    (e.summary ?? "").toLowerCase().includes(q)
  );
};

export interface EntityTableMeta {
  updateKind: (entityId: string, kind: EntityKind) => void;
  updateSummary: (entityId: string, summary: string) => void;
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

function createdColumnHeader({ column }: HeaderContext<EntityRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Created" />;
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

function renderUpdatedAtCell(ctx: CellContext<EntityRecord, unknown>) {
  return (
    <RelativeTime
      value={ctx.row.original.updatedAt}
      className="text-label-mono-sm whitespace-nowrap"
    />
  );
}

function renderCreatedAtCell(ctx: CellContext<EntityRecord, unknown>) {
  return (
    <RelativeTime
      value={ctx.row.original.createdAt}
      className="text-label-mono-sm whitespace-nowrap"
    />
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
    size: 120,
    minSize: 110,
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
    size: 260,
    minSize: 180,
  },
  {
    accessorKey: "updatedAt",
    header: updatedColumnHeader,
    cell: renderUpdatedAtCell,
    meta: { label: "Updated" },
    size: 110,
    minSize: 90,
  },
  {
    accessorKey: "createdAt",
    header: createdColumnHeader,
    cell: renderCreatedAtCell,
    meta: { label: "Created" },
    size: 110,
    minSize: 90,
  },
];
