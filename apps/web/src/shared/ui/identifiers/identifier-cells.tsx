/* oxlint-disable react/only-export-components, react-doctor/only-export-components -- column factory + shared options for IdentifiersSection */
import type {
  CellContext,
  ColumnDef,
  HeaderContext,
} from "@tanstack/react-table";
import { CopyIcon } from "lucide-react";
import type { ReactNode } from "react";

import { isConfirmedBlocked } from "@/shared/lib/confirmed-evidence";
import { TOAST_COPIED, TOAST_COULDNT_COPY } from "@/shared/lib/toast-copy";
import {
  DataTableColumnHeader,
  EditableSelectCell,
  EditableSuggestCell,
  EditableTextCell,
  type EditableSelectOption,
} from "@/shared/ui/data-table";
import { createTableActionsContext } from "@/shared/ui/data-table/table-actions-context";
import type { DataTableFeatures } from "@/shared/ui/data-table/table-features";
import {
  tryCommitIdentifierPlatform,
  tryCommitIdentifierType,
  tryCommitIdentifierValue,
} from "@/shared/ui/identifiers/commit-identifier-field";
import { IdentifierEvidenceCell } from "@/shared/ui/identifiers/identifier-evidence-cell";
import { IdentifierNotesCell } from "@/shared/ui/identifiers/identifier-notes-cell";
import { identifierRowActions } from "@/shared/ui/identifiers/identifier-row-actions";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import { Button } from "@/shared/ui/primitives/button";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { toast } from "@/shared/ui/toast";
import {
  CONFIDENCE_OPTIONS,
  IDENTIFIER_PLATFORM_OPTIONS,
  IDENTIFIER_STATUS_OPTIONS,
  IDENTIFIER_TYPE_OPTIONS,
  identifierPlatformOptionMatchesQuery,
} from "@/shared/ui/vocab";
import type { IdentifierRecord } from "@watchdog/core/graph";
import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";
import {
  trimmedConfidenceTierSchema,
  trimmedIdentifierStatusSchema,
  trimmedIdentifierTypeSchema,
  type ConfidenceTier,
  type IdentifierStatus,
  type IdentifierType,
} from "@watchdog/schemas/shared";

export { isHandleWithoutPlatform } from "@/shared/ui/identifiers/commit-identifier-field";

export function IdentifierValueCopyControl({ value }: { value: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      aria-label="Copy value"
      title="Copy value"
      onClick={(event) => {
        event.stopPropagation();
        void (async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast.success(TOAST_COPIED);
          } catch {
            toast.error(TOAST_COULDNT_COPY);
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

export type IdentifierFieldUpdate = {
  value?: string;
  platform?: string;
  type?: IdentifierType;
  status?: IdentifierStatus;
  confidence?: ConfidenceTier;
  notes?: string;
};

/**
 * The Identifier an inline edit targets: its id and the `version` the table rendered it at, which
 * the write sends as `expectedVersion` (a row that changed meanwhile is a stale-edit conflict).
 */
export type IdentifierEditTarget = Pick<IdentifierRecord, "id" | "version">;

export type IdentifierTableActions = {
  updateField: (
    target: IdentifierEditTarget,
    field: IdentifierFieldUpdate
  ) => void;
  evidenceOptions: readonly EvidenceOption[];
  onEvidenceClick?: (evidenceId: string) => void;
  saveEvidence: (
    target: IdentifierEditTarget,
    evidenceIds: string[]
  ) => void | Promise<void>;
  /** Notes are saved from a sheet, so the caller awaits it: a failure keeps the sheet open. */
  saveNotes: (target: IdentifierEditTarget, notes: string) => Promise<void>;
  onOpenSubject?: (row: IdentifierRecord) => void;
  onCopyValue: (value: string) => void;
  onDeleteIdentifier: (row: IdentifierRecord) => void;
  /** The row's history control (the Dossier supplies it; other tables show none). */
  renderHistory?: (row: IdentifierRecord) => ReactNode;
};

export const {
  Provider: IdentifierTableActionsProvider,
  useActions: useIdentifierTableActions,
} = createTableActionsContext<IdentifierTableActions>("IdentifierTableActions");

function valueColumnHeader({
  column,
}: HeaderContext<DataTableFeatures, IdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Value" />;
}

function typeColumnHeader({
  column,
}: HeaderContext<DataTableFeatures, IdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Type" />;
}

function platformColumnHeader({
  column,
}: HeaderContext<DataTableFeatures, IdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Platform" />;
}

function statusColumnHeader({
  column,
}: HeaderContext<DataTableFeatures, IdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Status" />;
}

function confidenceColumnHeader({
  column,
}: HeaderContext<DataTableFeatures, IdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Confidence" />;
}

function evidenceColumnHeader({
  column,
}: HeaderContext<DataTableFeatures, IdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Evidence" />;
}

function notesColumnHeader({
  column,
}: HeaderContext<DataTableFeatures, IdentifierRecord>) {
  return (
    <DataTableColumnHeader
      column={column}
      title="Notes"
      className="flex w-full justify-center"
    />
  );
}

function IdentifierValueCell(
  ctx: CellContext<DataTableFeatures, IdentifierRecord>
) {
  const meta = useIdentifierTableActions();
  const row = ctx.row.original;
  return (
    <EditableTextCell
      value={row.value}
      placeholder="Value…"
      aria-label="Identifier value"
      suffix={<IdentifierValueCopyControl value={row.value} />}
      onCommit={(next) => {
        const value = tryCommitIdentifierValue(row.type, next, row.platform);
        if (value === false) return false;
        meta.updateField(row, { value });
        // oxlint-disable-next-line unicorn/no-useless-undefined -- consistent-return requires an explicit value alongside the `false` return above
        return undefined;
      }}
    />
  );
}

function IdentifierTypeCell(
  ctx: CellContext<DataTableFeatures, IdentifierRecord>
) {
  const meta = useIdentifierTableActions();
  const row = ctx.row.original;
  return (
    <EditableSelectCell
      value={row.type}
      options={TYPE_OPTIONS}
      aria-label="Type"
      onCommit={(next) => {
        const type = trimmedIdentifierTypeSchema.parse(next);
        const committed = tryCommitIdentifierType(
          type,
          row.value,
          row.platform
        );
        if (committed === false) return;
        meta.updateField(row, committed);
      }}
    />
  );
}

function IdentifierPlatformCell(
  ctx: CellContext<DataTableFeatures, IdentifierRecord>
) {
  const meta = useIdentifierTableActions();
  const row = ctx.row.original;
  return (
    <EditableSuggestCell
      value={row.platform}
      options={PLATFORM_OPTIONS}
      filter={identifierPlatformOptionMatchesQuery}
      placeholder="Platform"
      aria-label="Platform"
      onCommit={(next) => {
        const platform = tryCommitIdentifierPlatform(row.type, row.value, next);
        if (platform === false) return;
        meta.updateField(row, { platform });
      }}
    />
  );
}

function IdentifierStatusCell(
  ctx: CellContext<DataTableFeatures, IdentifierRecord>
) {
  const meta = useIdentifierTableActions();
  const row = ctx.row.original;
  return (
    <EditableSelectCell
      value={row.status}
      options={STATUS_OPTIONS}
      aria-label="Status"
      onCommit={(next) => {
        meta.updateField(row, {
          status: trimmedIdentifierStatusSchema.parse(next),
        });
      }}
    />
  );
}

function IdentifierConfidenceCell(
  ctx: CellContext<DataTableFeatures, IdentifierRecord>
) {
  const meta = useIdentifierTableActions();
  const row = ctx.row.original;
  return (
    <EditableSelectCell
      value={row.confidence}
      options={CONFIDENCE_OPTIONS}
      aria-label="Confidence"
      onCommit={(next) => {
        const confidence = trimmedConfidenceTierSchema.parse(next);
        if (isConfirmedBlocked(confidence, row.evidenceIds)) {
          toast.error(CONFIRMED_REQUIRES_EVIDENCE);
          return;
        }
        meta.updateField(row, { confidence });
      }}
    />
  );
}

function DossierEvidenceCell(
  ctx: CellContext<DataTableFeatures, IdentifierRecord>
) {
  const meta = useIdentifierTableActions();
  const row = ctx.row.original;
  return (
    <IdentifierEvidenceCell
      row={row}
      evidenceOptions={meta.evidenceOptions}
      onEvidenceClick={meta.onEvidenceClick}
      saveEvidence={meta.saveEvidence}
    />
  );
}

function DossierNotesCell(
  ctx: CellContext<DataTableFeatures, IdentifierRecord>
) {
  const meta = useIdentifierTableActions();
  const row = ctx.row.original;
  return (
    <IdentifierNotesCell
      identifierId={row.id}
      notes={row.notes}
      version={row.version}
      saveNotes={async (identifierId, notes, version) =>
        meta.saveNotes({ id: identifierId, version }, notes)
      }
    />
  );
}

function IdentifierActionsCell(
  ctx: CellContext<DataTableFeatures, IdentifierRecord>
) {
  const meta = useIdentifierTableActions();
  const row = ctx.row.original;
  return (
    <div className="flex items-center justify-end gap-0.5">
      {meta.renderHistory?.(row)}
      <RowActionsMenu
        label={`Actions for ${row.value}`}
        actions={identifierRowActions(row, meta)}
      />
    </div>
  );
}

export const dossierIdentifierColumns: ColumnDef<
  DataTableFeatures,
  IdentifierRecord
>[] = [
  {
    accessorKey: "value",
    header: valueColumnHeader,
    cell: IdentifierValueCell,
    size: 170,
    meta: { label: "Value" },
    enableHiding: false,
  },
  {
    accessorKey: "type",
    header: typeColumnHeader,
    cell: IdentifierTypeCell,
    size: 110,
    minSize: 100,
    meta: { label: "Type" },
  },
  {
    accessorKey: "platform",
    header: platformColumnHeader,
    cell: IdentifierPlatformCell,
    size: 130,
    minSize: 120,
    meta: { label: "Platform" },
  },
  {
    accessorKey: "status",
    header: statusColumnHeader,
    cell: IdentifierStatusCell,
    size: 110,
    minSize: 100,
    meta: { label: "Status" },
  },
  {
    accessorKey: "confidence",
    header: confidenceColumnHeader,
    cell: IdentifierConfidenceCell,
    size: 110,
    minSize: 100,
    meta: { label: "Confidence" },
  },
  {
    id: "evidence",
    header: evidenceColumnHeader,
    cell: DossierEvidenceCell,
    enableSorting: false,
    size: 150,
    meta: { label: "Evidence" },
  },
  {
    accessorKey: "notes",
    header: notesColumnHeader,
    cell: DossierNotesCell,
    enableSorting: false,
    size: 52,
    minSize: 48,
    meta: { label: "Notes" },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: IdentifierActionsCell,
    enableSorting: false,
    enableHiding: false,
    size: 72,
    minSize: 72,
    meta: { label: "Actions" },
  },
];
