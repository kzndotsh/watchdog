/* oxlint-disable react/only-export-components -- column factory for IdentifiersPage */
import type {
  CellContext,
  ColumnDef,
  HeaderContext,
} from "@tanstack/react-table";

import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { isConfirmedBlocked } from "@/shared/lib/confirmed-evidence";
import {
  DataTableColumnHeader,
  EditableSelectCell,
  EditableSuggestCell,
  EditableTextCell,
} from "@/shared/ui/data-table";
import type { ServerTableFeatures } from "@/shared/ui/data-table/server-table-features";
import { createTableActionsContext } from "@/shared/ui/data-table/table-actions-context";
import {
  tryCommitIdentifierPlatform,
  tryCommitIdentifierType,
  tryCommitIdentifierValue,
} from "@/shared/ui/identifiers/commit-identifier-field";
import {
  IdentifierValueCopyControl,
  PLATFORM_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  type IdentifierEditTarget,
  type IdentifierFieldUpdate,
} from "@/shared/ui/identifiers/identifier-cells";
import {
  IdentifierEvidenceCell,
  type EvidenceLinks,
} from "@/shared/ui/identifiers/identifier-evidence-cell";
import { IdentifierNotesCell } from "@/shared/ui/identifiers/identifier-notes-cell";
import { identifierRowActions } from "@/shared/ui/identifiers/identifier-row-actions";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { toast } from "@/shared/ui/toast";
import {
  CONFIDENCE_OPTIONS,
  EntityKindGlyph,
  identifierPlatformOptionMatchesQuery,
} from "@/shared/ui/vocab";
import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";
import {
  trimmedConfidenceTierSchema,
  entityDisplayLabel,
  trimmedIdentifierStatusSchema,
  trimmedIdentifierTypeSchema,
} from "@watchdog/schemas/shared";

export type IdentifiersTableActions = {
  evidence: EvidenceLinks;
  updateField: (
    target: IdentifierEditTarget,
    patch: IdentifierFieldUpdate
  ) => void;
  saveEvidence: (
    target: IdentifierEditTarget,
    evidenceIds: string[]
  ) => void | Promise<void>;
  saveNotes: (target: IdentifierEditTarget, notes: string) => Promise<void>;
  onOpenSubject: (row: CaseIdentifierRecord) => void;
  onCopyValue: (value: string) => void;
  onDeleteIdentifier: (row: CaseIdentifierRecord) => void;
};

export const {
  Provider: IdentifiersTableActionsProvider,
  useActions: useIdentifiersTableActions,
} = createTableActionsContext<IdentifiersTableActions>(
  "IdentifiersTableActions"
);

function entityColumnHeader({
  column,
}: HeaderContext<ServerTableFeatures, CaseIdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Entity" />;
}

function valueColumnHeader({
  column,
}: HeaderContext<ServerTableFeatures, CaseIdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Value" />;
}

function typeColumnHeader({
  column,
}: HeaderContext<ServerTableFeatures, CaseIdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Type" />;
}

function platformColumnHeader({
  column,
}: HeaderContext<ServerTableFeatures, CaseIdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Platform" />;
}

function statusColumnHeader({
  column,
}: HeaderContext<ServerTableFeatures, CaseIdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Status" />;
}

function confidenceColumnHeader({
  column,
}: HeaderContext<ServerTableFeatures, CaseIdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Confidence" />;
}

function evidenceColumnHeader({
  column,
}: HeaderContext<ServerTableFeatures, CaseIdentifierRecord>) {
  return <DataTableColumnHeader column={column} title="Evidence" />;
}

function notesColumnHeader({
  column,
}: HeaderContext<ServerTableFeatures, CaseIdentifierRecord>) {
  return (
    <DataTableColumnHeader
      column={column}
      title="Notes"
      className="flex w-full justify-center"
    />
  );
}

function renderEntityCell(
  ctx: CellContext<ServerTableFeatures, CaseIdentifierRecord>
) {
  const row = ctx.row.original;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <EntityKindGlyph kind={row.entityKind} />
      <span className="truncate text-xs">
        {entityDisplayLabel({ name: row.entityName, slug: row.entitySlug })}
      </span>
    </div>
  );
}

function TypeCell(ctx: CellContext<ServerTableFeatures, CaseIdentifierRecord>) {
  const meta = useIdentifiersTableActions();
  const row = ctx.row.original;
  return (
    <EditableSelectCell
      value={row.type}
      options={TYPE_OPTIONS}
      aria-label="Type"
      onCommit={(next) => {
        const type = trimmedIdentifierTypeSchema.parse(next);
        if (type === row.type) return;
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

function ValueCell(
  ctx: CellContext<ServerTableFeatures, CaseIdentifierRecord>
) {
  const meta = useIdentifiersTableActions();
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
        // oxlint-disable-next-line unicorn/no-useless-undefined -- consistent-return with the `false` reject above
        return undefined;
      }}
    />
  );
}

function PlatformCell(
  ctx: CellContext<ServerTableFeatures, CaseIdentifierRecord>
) {
  const meta = useIdentifiersTableActions();
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
        if (platform === row.platform) return;
        meta.updateField(row, { platform });
      }}
    />
  );
}

function StatusCell(
  ctx: CellContext<ServerTableFeatures, CaseIdentifierRecord>
) {
  const meta = useIdentifiersTableActions();
  const row = ctx.row.original;
  return (
    <EditableSelectCell
      value={row.status}
      options={STATUS_OPTIONS}
      aria-label="Status"
      onCommit={(next) => {
        const status = trimmedIdentifierStatusSchema.parse(next);
        if (status === row.status) return;
        meta.updateField(row, { status });
      }}
    />
  );
}

function ConfidenceCell(
  ctx: CellContext<ServerTableFeatures, CaseIdentifierRecord>
) {
  const meta = useIdentifiersTableActions();
  const row = ctx.row.original;
  return (
    <EditableSelectCell
      value={row.confidence}
      options={CONFIDENCE_OPTIONS}
      aria-label="Confidence"
      onCommit={(next) => {
        const confidence = trimmedConfidenceTierSchema.parse(next);
        if (confidence === row.confidence) return;
        if (isConfirmedBlocked(confidence, row.evidenceIds)) {
          toast.error(CONFIRMED_REQUIRES_EVIDENCE);
          return;
        }
        meta.updateField(row, { confidence });
      }}
    />
  );
}

function EvidenceCell(
  ctx: CellContext<ServerTableFeatures, CaseIdentifierRecord>
) {
  const meta = useIdentifiersTableActions();
  const row = ctx.row.original;
  return (
    <IdentifierEvidenceCell
      row={row}
      evidence={meta.evidence}
      saveEvidence={meta.saveEvidence}
    />
  );
}

function NotesCell(
  ctx: CellContext<ServerTableFeatures, CaseIdentifierRecord>
) {
  const meta = useIdentifiersTableActions();
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

function ActionsCell(
  ctx: CellContext<ServerTableFeatures, CaseIdentifierRecord>
) {
  const meta = useIdentifiersTableActions();
  const row = ctx.row.original;
  return (
    <div className="flex justify-end">
      <RowActionsMenu
        label={`Actions for ${row.value}`}
        actions={identifierRowActions(row, meta)}
      />
    </div>
  );
}

export const identifiersTableColumns: ColumnDef<
  ServerTableFeatures,
  CaseIdentifierRecord
>[] = [
  {
    id: "entity",
    header: entityColumnHeader,
    cell: renderEntityCell,
    meta: { label: "Entity" },
    enableHiding: false,
    size: 160,
  },
  {
    accessorKey: "value",
    header: valueColumnHeader,
    cell: ValueCell,
    meta: { label: "Value" },
    enableHiding: false,
    size: 200,
  },
  {
    accessorKey: "type",
    header: typeColumnHeader,
    cell: TypeCell,
    meta: { label: "Type" },
    size: 120,
    minSize: 100,
  },
  {
    accessorKey: "platform",
    header: platformColumnHeader,
    cell: PlatformCell,
    meta: { label: "Platform" },
    size: 130,
    minSize: 120,
  },
  {
    accessorKey: "status",
    header: statusColumnHeader,
    cell: StatusCell,
    meta: { label: "Status" },
    size: 120,
    minSize: 100,
  },
  {
    accessorKey: "confidence",
    header: confidenceColumnHeader,
    cell: ConfidenceCell,
    meta: { label: "Confidence" },
    size: 120,
    minSize: 100,
  },
  {
    id: "evidence",
    header: evidenceColumnHeader,
    cell: EvidenceCell,
    meta: { label: "Evidence" },
    size: 150,
    enableSorting: false,
  },
  {
    accessorKey: "notes",
    header: notesColumnHeader,
    cell: NotesCell,
    meta: { label: "Notes" },
    size: 52,
    minSize: 48,
    enableSorting: false,
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
