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
import { entityRowActions } from "@/domains/entities/lib/entity-row-actions";
import type { EntityRecord } from "@/domains/entities/types";
import {
  DataTableColumnHeader,
  EditableSelectCell,
  EditableTextCell,
} from "@/shared/ui/data-table";
import { createTableActionsContext } from "@/shared/ui/data-table/table-actions-context";
import type { BoundedTableFeatures } from "@/shared/ui/data-table/table-features";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { entityMatchesQuery } from "@/shared/ui/entity-match";
import { NotesIconCell } from "@/shared/ui/identifiers/notes-icon-cell";
import { formatRelativeTime } from "@/shared/ui/relative-time.lib";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { ENTITY_KIND_OPTIONS, EntityKindGlyph } from "@/shared/ui/vocab";
import { WithTooltip } from "@/shared/ui/with-tooltip";
import {
  entityDisplayLabel,
  trimmedEntityKindSchema,
  type EntityKind,
} from "@watchdog/schemas/shared";

/** A table row: the Entity with its Connection peers, so the global filter and the Connections cell read them from the data. */
export type EntityRow = EntityRecord & {
  peers: readonly EntityConnectionPeer[];
};

export const entityGlobalFilterFn: FilterFn<BoundedTableFeatures, EntityRow> = (
  row,
  _id,
  filterValue
) => {
  const raw = String(filterValue ?? "");
  const q = raw.toLowerCase().trim();
  if (!q) return true;
  const e = row.original;
  const has = (text: string | null) => !!text?.toLowerCase().includes(q);
  return (
    entityMatchesQuery(e, raw) ||
    has(e.summary) ||
    has(e.notes) ||
    e.peers.some(
      (peer) =>
        entityMatchesQuery({ name: peer.peerName, slug: peer.peerSlug }, raw) ||
        has(peer.peerSummary) ||
        has(peer.peerNotes) ||
        has(peer.notes)
    )
  );
};

/**
 * The Entity an inline edit targets: its id and the `version` the table rendered it at, which the
 * write sends as `expectedVersion` (a row that changed meanwhile is a stale-edit conflict).
 */
export type EntityEditTarget = Pick<EntityRecord, "id" | "version">;

export type EntityTableActions = {
  updateKind: (target: EntityEditTarget, kind: EntityKind) => void;
  updateSummary: (target: EntityEditTarget, summary: string) => void;
  updateNotes: (target: EntityEditTarget, notes: string) => Promise<void>;
  entityOptions: readonly EntityOption[];
  createConnection: (
    centerId: string,
    input: CreateEntityConnectionInput
  ) => Promise<void>;
  updateConnection: (
    centerId: string,
    input: UpdateEntityConnectionInput
  ) => Promise<void>;
  deleteConnection: (centerId: string, edgeId: string) => Promise<void>;
  onOpenEntity: (entity: EntityRecord) => void;
  onCopyEntityLink: (entity: EntityRecord) => void;
  onCopyEntityMarkdown: (entity: EntityRecord) => void;
  onDeleteEntity: (entity: EntityRecord) => void;
};

export const {
  Provider: EntityTableActionsProvider,
  useActions: useEntityTableActions,
} = createTableActionsContext<EntityTableActions>("EntityTableActions");

function arrayIncludesFilter(value: unknown, cell: string): boolean {
  if (!Array.isArray(value) || value.length === 0) return true;
  return value.includes(cell);
}

function filterByKind(
  row: { original: EntityRow },
  _id: string,
  value: unknown
): boolean {
  return arrayIncludesFilter(value, row.original.kind);
}

function nameColumnHeader({
  column,
}: HeaderContext<BoundedTableFeatures, EntityRow>) {
  return <DataTableColumnHeader column={column} title="Name" />;
}

function kindColumnHeader({
  column,
}: HeaderContext<BoundedTableFeatures, EntityRow>) {
  return <DataTableColumnHeader column={column} title="Kind" />;
}

function summaryColumnHeader({
  column,
}: HeaderContext<BoundedTableFeatures, EntityRow>) {
  return <DataTableColumnHeader column={column} title="Summary" />;
}

function connectionsColumnHeader({
  column,
}: HeaderContext<BoundedTableFeatures, EntityRow>) {
  return <DataTableColumnHeader column={column} title="Connections" />;
}

function updatedColumnHeader({
  column,
}: HeaderContext<BoundedTableFeatures, EntityRow>) {
  return <DataTableColumnHeader column={column} title="Updated" />;
}

function notesColumnHeader({
  column,
}: HeaderContext<BoundedTableFeatures, EntityRow>) {
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

function renderNameCell(ctx: CellContext<BoundedTableFeatures, EntityRow>) {
  const row = ctx.row.original;
  const label = entityDisplayLabel(row);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <EntityKindGlyph kind={row.kind} />
      <span className="block min-w-0 truncate text-sm">{label}</span>
    </div>
  );
}

function KindCell(ctx: CellContext<BoundedTableFeatures, EntityRow>) {
  const meta = useEntityTableActions();
  const row = ctx.row.original;
  return (
    <EditableSelectCell
      value={row.kind}
      options={ENTITY_KIND_OPTIONS}
      aria-label="Entity kind"
      onCommit={(next) => {
        const kind = trimmedEntityKindSchema.parse(next);
        if (kind === row.kind) return;
        meta.updateKind(row, kind);
      }}
    />
  );
}

function ConnectionsCell(ctx: CellContext<BoundedTableFeatures, EntityRow>) {
  const meta = useEntityTableActions();
  const row = ctx.row.original;
  return (
    <EntityConnectionsCell
      entity={row}
      peers={row.peers}
      entityOptions={meta.entityOptions}
      onCreate={async (input) => meta.createConnection(row.id, input)}
      onUpdate={async (input) => meta.updateConnection(row.id, input)}
      onDelete={async (edgeId) => meta.deleteConnection(row.id, edgeId)}
    />
  );
}

function SummaryCell(ctx: CellContext<BoundedTableFeatures, EntityRow>) {
  const meta = useEntityTableActions();
  const row = ctx.row.original;
  return (
    <EditableTextCell
      value={row.summary ?? ""}
      placeholder="Summary…"
      aria-label="Summary"
      onCommit={(next) => {
        const trimmed = next.trim();
        const current = (row.summary ?? "").trim();
        if (trimmed === current) return;
        meta.updateSummary(row, trimmed);
      }}
    />
  );
}

function NotesCell(ctx: CellContext<BoundedTableFeatures, EntityRow>) {
  const meta = useEntityTableActions();
  const row = ctx.row.original;
  return (
    <NotesIconCell
      id={row.id}
      notes={row.notes}
      version={row.version}
      editorAriaLabel="Entity notes"
      saveNotes={async (entityId, notes, version) =>
        meta.updateNotes({ id: entityId, version }, notes)
      }
    />
  );
}

function renderUpdatedAtCell(
  ctx: CellContext<BoundedTableFeatures, EntityRow>
) {
  const { updatedAt, createdAt } = ctx.row.original;
  if (!updatedAt) {
    return <span className="text-muted-foreground text-2xs font-mono">—</span>;
  }

  return (
    <WithTooltip
      shouldWrapSpan
      content={
        <div className="flex flex-col gap-0.5 text-left">
          <span>Updated {formatFullLocalDateTime(updatedAt)}</span>
          <span>Created {formatFullLocalDateTime(createdAt)}</span>
        </div>
      }
    >
      <time
        dateTime={updatedAt}
        className="text-muted-foreground text-2xs cursor-default font-mono whitespace-nowrap tabular-nums"
      >
        <span suppressHydrationWarning>{formatRelativeTime(updatedAt)}</span>
      </time>
    </WithTooltip>
  );
}

function ActionsCell(ctx: CellContext<BoundedTableFeatures, EntityRow>) {
  const meta = useEntityTableActions();
  const row = ctx.row.original;
  return (
    <div className="flex justify-end">
      <RowActionsMenu
        label={`Actions for ${entityDisplayLabel(row)}`}
        actions={entityRowActions(row, meta)}
      />
    </div>
  );
}

export const entityTableColumns: ColumnDef<BoundedTableFeatures, EntityRow>[] =
  [
    {
      id: "name",
      accessorFn: (row) => entityDisplayLabel(row),
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
      cell: KindCell,
      filterFn: filterByKind,
      meta: { label: "Kind" },
      size: 100,
      minSize: 90,
    },
    {
      accessorKey: "summary",
      header: summaryColumnHeader,
      cell: SummaryCell,
      meta: { label: "Summary" },
      size: 280,
    },
    {
      id: "connections",
      header: connectionsColumnHeader,
      cell: ConnectionsCell,
      enableSorting: false,
      meta: { label: "Connections" },
      size: 280,
      minSize: 200,
    },
    {
      accessorKey: "notes",
      header: notesColumnHeader,
      cell: NotesCell,
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
      cell: ActionsCell,
      enableSorting: false,
      enableHiding: false,
      meta: { label: "Actions" },
      size: 48,
      minSize: 48,
    },
  ];
