/* oxlint-disable react/only-export-components -- column factory for IdentifiersPage */
import type {
  CellContext,
  ColumnDef,
  FilterFn,
  HeaderContext,
} from "@tanstack/react-table";
import { toast } from "sonner";

import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import {
  tryCommitIdentifierPlatform,
  tryCommitIdentifierType,
  tryCommitIdentifierValue,
} from "@/domains/entities/lib/commit-identifier-field";
import {
  CONFIRMED_REQUIRES_EVIDENCE_HINT,
  isConfirmedBlocked,
} from "@/shared/lib/confirmed-evidence";
import {
  DataTableColumnHeader,
  EditableSelectCell,
  EditableSuggestCell,
  EditableTextCell,
} from "@/shared/ui/data-table";
import {
  IdentifierValueCopyControl,
  PLATFORM_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  type IdentifierFieldUpdate,
} from "@/shared/ui/identifiers/identifier-cells";
import { IdentifierEvidenceCell } from "@/shared/ui/identifiers/identifier-evidence-cell";
import { IdentifierNotesCell } from "@/shared/ui/identifiers/identifier-notes-cell";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/ui/shadcn/dropdown-menu";
import { CONFIDENCE_OPTIONS, EntityKindGlyph } from "@/shared/ui/vocab";
import {
  confidenceTierSchema,
  identifierStatusSchema,
  identifierTypeSchema,
} from "@watchdog/schemas";

export const identifiersGlobalFilterFn: FilterFn<CaseIdentifierRecord> = (
  row,
  _id,
  filterValue
) => {
  const q = String(filterValue ?? "")
    .toLowerCase()
    .trim();
  if (!q) return true;
  const r = row.original;
  return (
    r.value.toLowerCase().includes(q) ||
    r.entityName.toLowerCase().includes(q) ||
    r.entitySlug.toLowerCase().includes(q) ||
    r.platform.toLowerCase().includes(q) ||
    (r.notes ?? "").toLowerCase().includes(q) ||
    r.type.toLowerCase().includes(q) ||
    r.status.toLowerCase().includes(q) ||
    r.confidence.toLowerCase().includes(q)
  );
};

export interface IdentifiersTableMeta {
  evidenceOptions: readonly EvidenceOption[];
  updateField: (identifierId: string, patch: IdentifierFieldUpdate) => void;
  saveEvidence: (
    identifierId: string,
    evidenceIds: string[]
  ) => void | Promise<void>;
  onOpenSubject: (row: CaseIdentifierRecord) => void;
  onCopyValue: (value: string) => void;
  onDeleteIdentifier: (row: CaseIdentifierRecord) => void;
}

function identifiersMeta(
  ctx: Pick<CellContext<CaseIdentifierRecord, unknown>, "table">
): IdentifiersTableMeta {
  return ctx.table.options.meta as IdentifiersTableMeta;
}

function arrayIncludesFilter(value: unknown, cell: string): boolean {
  if (!Array.isArray(value) || value.length === 0) return true;
  return value.includes(cell);
}

function filterByType(
  row: { original: CaseIdentifierRecord },
  _id: string,
  value: unknown
): boolean {
  return arrayIncludesFilter(value, row.original.type);
}

function filterByStatus(
  row: { original: CaseIdentifierRecord },
  _id: string,
  value: unknown
): boolean {
  return arrayIncludesFilter(value, row.original.status);
}

function filterByConfidence(
  row: { original: CaseIdentifierRecord },
  _id: string,
  value: unknown
): boolean {
  return arrayIncludesFilter(value, row.original.confidence);
}

function entityColumnHeader({
  column,
}: HeaderContext<CaseIdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Entity" />;
}

function valueColumnHeader({
  column,
}: HeaderContext<CaseIdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Value" />;
}

function typeColumnHeader({
  column,
}: HeaderContext<CaseIdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Type" />;
}

function platformColumnHeader({
  column,
}: HeaderContext<CaseIdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Platform" />;
}

function statusColumnHeader({
  column,
}: HeaderContext<CaseIdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Status" />;
}

function confidenceColumnHeader({
  column,
}: HeaderContext<CaseIdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Confidence" />;
}

function evidenceColumnHeader({
  column,
}: HeaderContext<CaseIdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Evidence" />;
}

function notesColumnHeader({
  column,
}: HeaderContext<CaseIdentifierRecord, unknown>) {
  return (
    <DataTableColumnHeader
      column={column}
      title="Notes"
      className="flex w-full justify-center"
    />
  );
}

function renderEntityCell(ctx: CellContext<CaseIdentifierRecord, unknown>) {
  const row = ctx.row.original;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <EntityKindGlyph kind={row.entityKind} />
      <span className="truncate text-xs font-medium">{row.entityName}</span>
    </div>
  );
}

function renderTypeCell(ctx: CellContext<CaseIdentifierRecord, unknown>) {
  const row = ctx.row.original;
  const meta = identifiersMeta(ctx);
  return (
    <EditableSelectCell
      value={row.type}
      options={TYPE_OPTIONS}
      aria-label="Type"
      onCommit={(next) => {
        const type = identifierTypeSchema.parse(next);
        if (type === row.type) return;
        const committed = tryCommitIdentifierType(
          type,
          row.value,
          row.platform
        );
        if (committed === false) return;
        meta.updateField(row.id, committed);
      }}
    />
  );
}

function renderValueCell(ctx: CellContext<CaseIdentifierRecord, unknown>) {
  const row = ctx.row.original;
  const meta = identifiersMeta(ctx);
  return (
    <EditableTextCell
      value={row.value}
      placeholder="Value…"
      aria-label="Identifier value"
      suffix={<IdentifierValueCopyControl value={row.value} />}
      onCommit={(next) => {
        const value = tryCommitIdentifierValue(row.type, next, row.platform);
        if (value === false) return false;
        meta.updateField(row.id, { value });
        // oxlint-disable-next-line unicorn/no-useless-undefined -- consistent-return with the `false` reject above
        return undefined;
      }}
    />
  );
}

function renderPlatformCell(ctx: CellContext<CaseIdentifierRecord, unknown>) {
  const row = ctx.row.original;
  const meta = identifiersMeta(ctx);
  return (
    <EditableSuggestCell
      value={row.platform}
      options={PLATFORM_OPTIONS}
      placeholder="Platform"
      aria-label="Platform"
      onCommit={(next) => {
        const platform = tryCommitIdentifierPlatform(row.type, row.value, next);
        if (platform === false) return;
        if (platform === row.platform) return;
        meta.updateField(row.id, { platform });
      }}
    />
  );
}

function renderStatusCell(ctx: CellContext<CaseIdentifierRecord, unknown>) {
  const row = ctx.row.original;
  const meta = identifiersMeta(ctx);
  return (
    <EditableSelectCell
      value={row.status}
      options={STATUS_OPTIONS}
      aria-label="Status"
      onCommit={(next) => {
        const status = identifierStatusSchema.parse(next);
        if (status === row.status) return;
        meta.updateField(row.id, { status });
      }}
    />
  );
}

function renderConfidenceCell(ctx: CellContext<CaseIdentifierRecord, unknown>) {
  const row = ctx.row.original;
  const meta = identifiersMeta(ctx);
  return (
    <EditableSelectCell
      value={row.confidence}
      options={CONFIDENCE_OPTIONS}
      aria-label="Confidence"
      onCommit={(next) => {
        const confidence = confidenceTierSchema.parse(next);
        if (confidence === row.confidence) return;
        if (isConfirmedBlocked(confidence, row.evidenceIds)) {
          toast.error(CONFIRMED_REQUIRES_EVIDENCE_HINT);
          return;
        }
        meta.updateField(row.id, { confidence });
      }}
    />
  );
}

function renderEvidenceCell(ctx: CellContext<CaseIdentifierRecord, unknown>) {
  const row = ctx.row.original;
  const meta = identifiersMeta(ctx);
  return (
    <IdentifierEvidenceCell
      row={row}
      evidenceOptions={meta.evidenceOptions}
      saveEvidence={meta.saveEvidence}
    />
  );
}

function renderNotesCell(ctx: CellContext<CaseIdentifierRecord, unknown>) {
  const row = ctx.row.original;
  const meta = identifiersMeta(ctx);
  return (
    <IdentifierNotesCell
      identifierId={row.id}
      notes={row.notes}
      saveNotes={(identifierId, notes) => {
        meta.updateField(identifierId, { notes });
      }}
    />
  );
}

function renderActionsCell(ctx: CellContext<CaseIdentifierRecord, unknown>) {
  const row = ctx.row.original;
  const meta = identifiersMeta(ctx);
  return (
    <div className="flex justify-end">
      <RowActionsMenu label={`Actions for ${row.value}`}>
        <DropdownMenuItem
          onClick={() => {
            meta.onOpenSubject(row);
          }}
        >
          Open identifier
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            meta.onCopyValue(row.value);
          }}
        >
          Copy value
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => {
            meta.onDeleteIdentifier(row);
          }}
        >
          Delete
        </DropdownMenuItem>
      </RowActionsMenu>
    </div>
  );
}

export const identifiersTableColumns: ColumnDef<CaseIdentifierRecord>[] = [
  {
    id: "entity",
    accessorFn: (row) => row.entityName,
    header: entityColumnHeader,
    cell: renderEntityCell,
    meta: { label: "Entity" },
    enableHiding: false,
    size: 160,
  },
  {
    accessorKey: "value",
    header: valueColumnHeader,
    cell: renderValueCell,
    meta: { label: "Value" },
    enableHiding: false,
    size: 200,
  },
  {
    accessorKey: "type",
    header: typeColumnHeader,
    cell: renderTypeCell,
    filterFn: filterByType,
    meta: { label: "Type" },
    size: 120,
    minSize: 100,
  },
  {
    accessorKey: "platform",
    header: platformColumnHeader,
    cell: renderPlatformCell,
    meta: { label: "Platform" },
    size: 130,
    minSize: 120,
  },
  {
    accessorKey: "status",
    header: statusColumnHeader,
    cell: renderStatusCell,
    filterFn: filterByStatus,
    meta: { label: "Status" },
    size: 120,
    minSize: 100,
  },
  {
    accessorKey: "confidence",
    header: confidenceColumnHeader,
    cell: renderConfidenceCell,
    filterFn: filterByConfidence,
    meta: { label: "Confidence" },
    size: 120,
    minSize: 100,
  },
  {
    id: "evidence",
    header: evidenceColumnHeader,
    cell: renderEvidenceCell,
    meta: { label: "Evidence" },
    size: 150,
    enableSorting: false,
  },
  {
    accessorKey: "notes",
    header: notesColumnHeader,
    cell: renderNotesCell,
    meta: { label: "Notes" },
    size: 52,
    minSize: 48,
    enableSorting: false,
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
