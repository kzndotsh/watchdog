/* oxlint-disable react/only-export-components, react-doctor/only-export-components -- column factory + shared options for IdentifiersSection */
import type {
  CellContext,
  ColumnDef,
  HeaderContext,
} from "@tanstack/react-table";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import type { IdentifierRecord } from "@/domains/entities/identifiers/identifiers.functions";
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
  type EditableSelectOption,
} from "@/shared/ui/data-table";
import { IdentifierEvidenceCell } from "@/shared/ui/identifiers/identifier-evidence-cell";
import { IdentifierNotesCell } from "@/shared/ui/identifiers/identifier-notes-cell";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import { Button } from "@/shared/ui/shadcn/button";
import {
  CONFIDENCE_OPTIONS,
  IDENTIFIER_PLATFORM_OPTIONS,
  IDENTIFIER_STATUS_OPTIONS,
  IDENTIFIER_TYPE_OPTIONS,
} from "@/shared/ui/vocab";
import {
  confidenceTierSchema,
  identifierStatusSchema,
  identifierTypeSchema,
  type ConfidenceTier,
  type IdentifierStatus,
  type IdentifierType,
} from "@watchdog/schemas";

export {
  HANDLE_REQUIRES_PLATFORM,
  isHandleWithoutPlatform,
} from "@/domains/entities/lib/commit-identifier-field";

export function IdentifierValueCopyControl({ value }: { value: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-foreground size-6 shrink-0 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      aria-label="Copy value"
      title="Copy value"
      onClick={(event) => {
        event.stopPropagation();
        void (async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast.success("Copied");
          } catch {
            toast.error("Couldn't copy");
          }
        })();
      }}
    >
      <CopyIcon className="size-3" aria-hidden />
    </Button>
  );
}

export const PLATFORM_OPTIONS: EditableSelectOption[] =
  IDENTIFIER_PLATFORM_OPTIONS;

export const TYPE_OPTIONS: EditableSelectOption[] = IDENTIFIER_TYPE_OPTIONS;
export const STATUS_OPTIONS: EditableSelectOption[] = IDENTIFIER_STATUS_OPTIONS;

export interface IdentifierFieldUpdate {
  value?: string;
  platform?: string;
  type?: IdentifierType;
  status?: IdentifierStatus;
  confidence?: ConfidenceTier;
  notes?: string;
}

export interface IdentifierTableMeta {
  updateField: (identifierId: string, field: IdentifierFieldUpdate) => void;
  evidenceOptions: EvidenceOption[];
  onEvidenceClick?: (evidenceId: string) => void;
  saveEvidence: (
    identifierId: string,
    evidenceIds: string[]
  ) => void | Promise<void>;
}

function identifierMeta(
  ctx: Pick<CellContext<IdentifierRecord, unknown>, "table">
): IdentifierTableMeta {
  return ctx.table.options.meta as IdentifierTableMeta;
}

function valueColumnHeader({
  column,
}: HeaderContext<IdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Value" />;
}

function typeColumnHeader({
  column,
}: HeaderContext<IdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Type" />;
}

function platformColumnHeader({
  column,
}: HeaderContext<IdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Platform" />;
}

function statusColumnHeader({
  column,
}: HeaderContext<IdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Status" />;
}

function confidenceColumnHeader({
  column,
}: HeaderContext<IdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Confidence" />;
}

function evidenceColumnHeader({
  column,
}: HeaderContext<IdentifierRecord, unknown>) {
  return <DataTableColumnHeader column={column} title="Evidence" />;
}

function notesColumnHeader({
  column,
}: HeaderContext<IdentifierRecord, unknown>) {
  return (
    <DataTableColumnHeader
      column={column}
      title="Notes"
      className="flex w-full justify-center"
    />
  );
}

function renderIdentifierValueCell(
  ctx: CellContext<IdentifierRecord, unknown>
) {
  const row = ctx.row.original;
  const meta = identifierMeta(ctx);
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
        // oxlint-disable-next-line unicorn/no-useless-undefined -- consistent-return requires an explicit value alongside the `false` return above
        return undefined;
      }}
    />
  );
}

function renderIdentifierTypeCell(ctx: CellContext<IdentifierRecord, unknown>) {
  const row = ctx.row.original;
  const meta = identifierMeta(ctx);
  return (
    <EditableSelectCell
      value={row.type}
      options={TYPE_OPTIONS}
      aria-label="Type"
      onCommit={(next) => {
        const type = identifierTypeSchema.parse(next);
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

function renderIdentifierPlatformCell(
  ctx: CellContext<IdentifierRecord, unknown>
) {
  const row = ctx.row.original;
  const meta = identifierMeta(ctx);
  return (
    <EditableSuggestCell
      value={row.platform}
      options={PLATFORM_OPTIONS}
      placeholder="Platform"
      aria-label="Platform"
      onCommit={(next) => {
        const platform = tryCommitIdentifierPlatform(row.type, row.value, next);
        if (platform === false) return;
        meta.updateField(row.id, { platform });
      }}
    />
  );
}

function renderIdentifierStatusCell(
  ctx: CellContext<IdentifierRecord, unknown>
) {
  const row = ctx.row.original;
  const meta = identifierMeta(ctx);
  return (
    <EditableSelectCell
      value={row.status}
      options={STATUS_OPTIONS}
      aria-label="Status"
      onCommit={(next) => {
        meta.updateField(row.id, {
          status: identifierStatusSchema.parse(next),
        });
      }}
    />
  );
}

function renderIdentifierConfidenceCell(
  ctx: CellContext<IdentifierRecord, unknown>
) {
  const row = ctx.row.original;
  const meta = identifierMeta(ctx);
  return (
    <EditableSelectCell
      value={row.confidence}
      options={CONFIDENCE_OPTIONS}
      aria-label="Confidence"
      onCommit={(next) => {
        const confidence = confidenceTierSchema.parse(next);
        if (isConfirmedBlocked(confidence, row.evidenceIds)) {
          toast.error(CONFIRMED_REQUIRES_EVIDENCE_HINT);
          return;
        }
        meta.updateField(row.id, { confidence });
      }}
    />
  );
}

function renderIdentifierEvidenceCell(
  ctx: CellContext<IdentifierRecord, unknown>
) {
  const row = ctx.row.original;
  const meta = identifierMeta(ctx);
  return (
    <IdentifierEvidenceCell
      row={row}
      evidenceOptions={meta.evidenceOptions}
      onEvidenceClick={meta.onEvidenceClick}
      saveEvidence={meta.saveEvidence}
    />
  );
}

function renderIdentifierNotesCell(
  ctx: CellContext<IdentifierRecord, unknown>
) {
  const row = ctx.row.original;
  const meta = identifierMeta(ctx);
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

export const dossierIdentifierColumns: ColumnDef<IdentifierRecord>[] = [
  {
    accessorKey: "value",
    header: valueColumnHeader,
    cell: renderIdentifierValueCell,
    size: 180,
    meta: { label: "Value" },
    enableHiding: false,
  },
  {
    accessorKey: "type",
    header: typeColumnHeader,
    cell: renderIdentifierTypeCell,
    size: 120,
    minSize: 100,
    meta: { label: "Type" },
  },
  {
    accessorKey: "platform",
    header: platformColumnHeader,
    cell: renderIdentifierPlatformCell,
    size: 140,
    minSize: 120,
    meta: { label: "Platform" },
  },
  {
    accessorKey: "status",
    header: statusColumnHeader,
    cell: renderIdentifierStatusCell,
    size: 120,
    minSize: 100,
    meta: { label: "Status" },
  },
  {
    accessorKey: "confidence",
    header: confidenceColumnHeader,
    cell: renderIdentifierConfidenceCell,
    size: 120,
    minSize: 100,
    meta: { label: "Confidence" },
  },
  {
    id: "evidence",
    header: evidenceColumnHeader,
    cell: renderIdentifierEvidenceCell,
    enableSorting: false,
    size: 160,
    meta: { label: "Evidence" },
  },
  {
    accessorKey: "notes",
    header: notesColumnHeader,
    cell: renderIdentifierNotesCell,
    enableSorting: false,
    size: 52,
    minSize: 48,
    meta: { label: "Notes" },
  },
];
