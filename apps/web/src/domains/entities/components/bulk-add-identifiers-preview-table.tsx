import { CircleAlertIcon, InfoIcon } from "lucide-react";

import {
  identifierPasteRowKey,
  type IdentifierPasteEntity,
  type IdentifierPasteRow,
  type IdentifierPasteRowOverride,
} from "@/domains/entities/lib/parse-identifier-paste";
import { pasteEntityErrorLabel } from "@/domains/entities/lib/paste-entity-error-label";
import {
  EditableSelectCell,
  EditableSuggestCell,
  EditableTextCell,
} from "@/shared/ui/data-table";
import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";
import {
  CONFIDENCE_OPTIONS,
  IDENTIFIER_PLATFORM_OPTIONS,
  IDENTIFIER_STATUS_OPTIONS,
  IDENTIFIER_TYPE_OPTIONS,
  identifierPlatformOptionMatchesQuery,
} from "@/shared/ui/vocab";
import { WithTooltip } from "@/shared/ui/with-tooltip";
import {
  trimmedConfidenceTierSchema,
  trimmedIdentifierStatusSchema,
  trimmedIdentifierTypeSchema,
  normalizeIdentifierPlatform,
} from "@watchdog/schemas/shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@watchdog/ui/components/table";

const PREVIEW_CONFIDENCE_OPTIONS = CONFIDENCE_OPTIONS.filter(
  (opt) => opt.value !== "confirmed"
);

/** Same ratios as identifiers-table.columns (Value 220 / Entity 180 / enums 140). */
const PREVIEW_COLUMNS = [
  { id: "value", width: "22%" },
  { id: "entity", width: "18%" },
  { id: "type", width: "14%" },
  { id: "platform", width: "14%" },
  { id: "status", width: "14%" },
  { id: "confidence", width: "14%" },
  { id: "note", width: "4%" },
] as const;

function previewNote(row: IdentifierPasteRow) {
  if (row.error !== null) {
    return (
      <WithTooltip content={row.error}>
        <CircleAlertIcon
          className="text-destructive size-3.5"
          aria-label={row.error}
        />
      </WithTooltip>
    );
  }
  if (row.note !== null) {
    return (
      <WithTooltip content={row.note}>
        <InfoIcon
          className="text-muted-foreground size-3.5"
          aria-label={row.note}
        />
      </WithTooltip>
    );
  }
  return null;
}

type BulkAddIdentifiersPreviewTableProps = {
  rows: IdentifierPasteRow[];
  entityOptions: EntityOption[];
  lockEntity: IdentifierPasteEntity | null;
  busy: boolean;
  setRowPatch: (
    row: IdentifierPasteRow,
    patch: IdentifierPasteRowOverride
  ) => void;
};

export function BulkAddIdentifiersPreviewTable({
  rows,
  entityOptions,
  lockEntity,
  busy,
  setRowPatch,
}: BulkAddIdentifiersPreviewTableProps) {
  return (
    <div className="max-h-56 overflow-auto rounded-md border">
      <Table className="w-full table-fixed">
        <colgroup>
          {PREVIEW_COLUMNS.map((col) => (
            <col key={col.id} style={{ width: col.width }} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="overflow-hidden">Value</TableHead>
            <TableHead className="overflow-hidden">Entity</TableHead>
            <TableHead className="overflow-hidden">Type</TableHead>
            <TableHead className="overflow-hidden">Platform</TableHead>
            <TableHead className="overflow-hidden">Status</TableHead>
            <TableHead className="overflow-hidden">Confidence</TableHead>
            <TableHead className="overflow-hidden text-center">
              <span className="sr-only">Note</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const entityHint = pasteEntityErrorLabel(row.entityError);
            return (
              <TableRow key={identifierPasteRowKey(row)}>
                <TableCell className="min-w-0 overflow-hidden">
                  <EditableTextCell
                    value={row.value}
                    placeholder="Value…"
                    aria-label="Value"
                    disabled={busy}
                    onCommit={(next) => {
                      const value = next.trim();
                      if (value === "") return false;
                      setRowPatch(row, { value });
                      // oxlint-disable-next-line unicorn/no-useless-undefined -- consistent-return with the `false` reject above
                      return undefined;
                    }}
                  />
                </TableCell>
                <TableCell className="min-w-0 overflow-hidden">
                  {lockEntity === null ? (
                    <EntityCombobox
                      entities={entityOptions}
                      value={row.entityId ?? ""}
                      onValueChange={(id) => {
                        setRowPatch(row, { entityId: id });
                      }}
                      allowEmpty
                      emptyLabel="—"
                      placeholder={entityHint ?? "—"}
                      variant="cell"
                      showClear={false}
                      disabled={busy}
                      className="w-full"
                      aria-invalid={entityHint !== null}
                      aria-label={`Entity for ${row.value || "row"}`}
                    />
                  ) : (
                    <span className="block truncate">
                      {row.entityName ?? "—"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="min-w-0 overflow-hidden">
                  <EditableSelectCell
                    value={row.type ?? ""}
                    options={IDENTIFIER_TYPE_OPTIONS}
                    allowEmpty
                    aria-label="Type"
                    disabled={busy}
                    onCommit={(next) => {
                      setRowPatch(row, {
                        type:
                          next === ""
                            ? null
                            : trimmedIdentifierTypeSchema.parse(next),
                      });
                    }}
                  />
                </TableCell>
                <TableCell className="min-w-0 overflow-hidden">
                  <EditableSuggestCell
                    value={row.platform}
                    options={IDENTIFIER_PLATFORM_OPTIONS}
                    filter={identifierPlatformOptionMatchesQuery}
                    placeholder="—"
                    aria-label="Platform"
                    disabled={busy}
                    onCommit={(next) => {
                      setRowPatch(row, {
                        platform: normalizeIdentifierPlatform(next),
                      });
                    }}
                  />
                </TableCell>
                <TableCell className="min-w-0 overflow-hidden">
                  <EditableSelectCell
                    value={row.status}
                    options={IDENTIFIER_STATUS_OPTIONS}
                    aria-label="Status"
                    disabled={busy}
                    onCommit={(next) => {
                      setRowPatch(row, {
                        status: trimmedIdentifierStatusSchema.parse(next),
                      });
                    }}
                  />
                </TableCell>
                <TableCell className="min-w-0 overflow-hidden">
                  <EditableSelectCell
                    value={row.confidence}
                    options={PREVIEW_CONFIDENCE_OPTIONS}
                    aria-label="Confidence"
                    disabled={busy}
                    onCommit={(next) => {
                      setRowPatch(row, {
                        confidence: trimmedConfidenceTierSchema.parse(next),
                      });
                    }}
                  />
                </TableCell>
                <TableCell className="overflow-hidden text-center">
                  {previewNote(row)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
