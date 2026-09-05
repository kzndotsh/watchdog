import { useMutation } from "@tanstack/react-query";
import { ArrowRightIcon, CircleAlertIcon, InfoIcon } from "lucide-react";
import { toast } from "sonner";

import { createIdentifierFn } from "@/domains/entities/identifiers/identifiers.functions";
import {
  identifierPasteColumnSamples,
  identifierPasteRowKey,
  isIdentifierPasteRowImportable,
  rebuildIdentifierPaste,
  type IdentifierPasteEntity,
  type IdentifierPasteRow,
  type IdentifierPasteTable,
  type IdentifierPasteTarget,
} from "@/domains/entities/lib/parse-identifier-paste";
import { pasteEntityErrorLabel } from "@/domains/entities/lib/paste-entity-error-label";
import {
  parsePasteTarget,
  useBulkAddIdentifiersPaste,
} from "@/domains/entities/lib/use-bulk-add-identifiers-paste";
import { cn, errMessage } from "@/lib/utils";
import {
  EditableSelectCell,
  EditableSuggestCell,
  EditableTextCell,
} from "@/shared/ui/data-table";
import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";
import { FieldSelect } from "@/shared/ui/field-select";
import {
  FormInlineError,
  FormInlineWarning,
} from "@/shared/ui/form-inline-message";
import { Button } from "@/shared/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/shadcn/dialog";
import { Field, FieldLabel } from "@/shared/ui/shadcn/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/shadcn/table";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { WithTooltip } from "@/shared/ui/timestamp";
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
  normalizeIdentifierPlatform,
} from "@watchdog/schemas";

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  entities: readonly EntityOption[];
  lockEntity?: IdentifierPasteEntity | null;
  onImported?: (entityIds: string[]) => Promise<void>;
}

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

function ColumnMapper({
  table,
  mapping,
  fieldOptions,
  busy,
  onMap,
}: {
  table: IdentifierPasteTable;
  mapping: readonly IdentifierPasteTarget[];
  fieldOptions: { value: string; label: string }[];
  busy: boolean;
  onMap: (index: number, target: IdentifierPasteTarget) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="text-muted-foreground grid grid-cols-[1fr_auto_minmax(12rem,1fr)] items-center gap-3 border-b px-3 py-2 text-xs font-medium">
        <div>Your column</div>
        <div />
        <div>Watchdog field</div>
      </div>
      {table.columnLabels.map((label, index) => {
        const samples = identifierPasteColumnSamples(table, index);
        const target = mapping[index] ?? "skip";
        return (
          <div
            // oxlint-disable-next-line react-doctor/no-array-index-as-key -- column position is identity
            key={`col-${String(index)}-${label}`}
            className="grid grid-cols-[1fr_auto_minmax(12rem,1fr)] items-center gap-3 border-b px-3 py-2 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {label || `Column ${index + 1}`}
              </div>
              {samples.length > 0 ? (
                <div className="text-muted-foreground truncate text-xs">
                  {samples.join(" · ")}
                </div>
              ) : null}
            </div>
            <ArrowRightIcon className="text-muted-foreground size-4 shrink-0" />
            <div className="min-w-0">
              <FieldSelect
                value={target}
                options={fieldOptions}
                onValueChange={(next) => {
                  const parsed = parsePasteTarget(next);
                  if (parsed !== null) onMap(index, parsed);
                }}
                disabled={busy}
                aria-label={`Map ${label || `column ${index + 1}`}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BulkAddIdentifiersDialog({
  open,
  onOpenChange,
  caseId,
  entities,
  lockEntity = null,
  onImported,
}: Props) {
  const pasteState = useBulkAddIdentifiersPaste({ entities, lockEntity });
  const {
    stage,
    setStage,
    paste,
    setPasteText,
    table,
    mapping,
    rows,
    validRows,
    showPlatform,
    canContinue,
    entityOptions,
    defaultEntityId,
    setDefaultEntityId,
    defaultPlatform,
    setDefaultPlatform,
    fieldOptions,
    setColumnMapping,
    setRowPatch,
    resetForm,
    retainFailedImport,
  } = pasteState;

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  const importMutation = useMutation({
    mutationFn: async (input: {
      rows: IdentifierPasteRow[];
      table: IdentifierPasteTable;
    }) => {
      let imported = 0;
      const importedEntityIds: string[] = [];
      const failed: {
        sourceIndex: number;
        key: string;
        message: string;
      }[] = [];
      for (const row of input.rows) {
        if (
          !isIdentifierPasteRowImportable(row) ||
          row.entityId === null ||
          row.type === null
        ) {
          continue;
        }
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop -- sequential partial success
          await createIdentifierFn({
            data: {
              caseId,
              entityId: row.entityId,
              type: row.type,
              value: row.value,
              platform: row.platform === "" ? undefined : row.platform,
              status: row.status,
              confidence: row.confidence,
            },
          });
          imported += 1;
          importedEntityIds.push(row.entityId);
        } catch (error) {
          failed.push({
            sourceIndex: row.sourceIndex,
            key: identifierPasteRowKey(row),
            message: errMessage(error, "Failed to add"),
          });
        }
      }
      return { imported, failed, importedEntityIds };
    },
    onSuccess: async (result, vars) => {
      const uniqueIds = [...new Set(result.importedEntityIds)];
      if (uniqueIds.length > 0) {
        await onImported?.(uniqueIds);
      }
      const invalidCount = vars.rows.filter(
        (row) => !isIdentifierPasteRowImportable(row)
      ).length;
      const skipped = result.failed.length + invalidCount;
      const summary = `Imported ${result.imported} · ${skipped} skipped`;
      if (result.imported > 0) {
        toast.success(summary);
      } else {
        toast.error(summary);
      }
      if (result.failed.length === 0 && invalidCount === 0) {
        handleOpenChange(false);
        return;
      }
      const keep = [
        ...vars.rows
          .filter((row) => !isIdentifierPasteRowImportable(row))
          .map((row) => row.sourceIndex),
        ...result.failed.map((row) => row.sourceIndex),
      ];
      retainFailedImport({
        paste: rebuildIdentifierPaste({
          table: vars.table,
          keepSourceIndices: keep,
        }),
        serverErrors: new Map(
          result.failed.map((row) => [row.key, row.message])
        ),
      });
    },
  });

  const busy = importMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Bulk add identifiers</DialogTitle>
          <DialogDescription>
            {stage === "paste"
              ? "Paste CSV, TSV, or one value per line."
              : "Match your columns to identifier fields. Type comes from the column or values."}
          </DialogDescription>
        </DialogHeader>

        {stage === "paste" ? (
          <Field className="gap-1">
            <FieldLabel htmlFor="bulk-add-identifiers-paste">Paste</FieldLabel>
            <Textarea
              id="bulk-add-identifiers-paste"
              value={paste}
              onChange={(e) => {
                setPasteText(e.target.value);
              }}
              disabled={busy}
              placeholder={
                "name,email,phone,twitter\nAlice,ada@example.com,+15551212,ada"
              }
              className="min-h-36 font-mono"
              data-1p-ignore
              data-lpignore="true"
              autoComplete="off"
            />
          </Field>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <Field className="gap-1">
                <FieldLabel>Entity</FieldLabel>
                <EntityCombobox
                  entities={
                    lockEntity === null
                      ? entityOptions
                      : [
                          {
                            id: lockEntity.id,
                            name: lockEntity.name,
                            slug: lockEntity.slug,
                          },
                        ]
                  }
                  value={lockEntity?.id ?? defaultEntityId}
                  onValueChange={setDefaultEntityId}
                  allowEmpty={lockEntity === null}
                  disabled={lockEntity !== null || busy}
                  emptyLabel="Entity"
                  aria-label="Default entity"
                />
                {lockEntity === null ? (
                  <p className="text-muted-foreground text-xs">
                    Applies to all rows. Change a row to override.
                  </p>
                ) : null}
              </Field>
              {showPlatform ? (
                <Field className="gap-1">
                  <FieldLabel>Platform</FieldLabel>
                  <FieldSelect
                    value={defaultPlatform}
                    options={[
                      { value: "", label: "—" },
                      ...IDENTIFIER_PLATFORM_OPTIONS,
                    ]}
                    placeholder="—"
                    onValueChange={setDefaultPlatform}
                    disabled={busy}
                    aria-label="Default platform"
                  />
                </Field>
              ) : null}
            </div>

            <ColumnMapper
              table={table}
              mapping={mapping}
              fieldOptions={fieldOptions}
              busy={busy}
              onMap={setColumnMapping}
            />

            {table.truncated ? (
              <FormInlineWarning>
                Showing first 200 rows ({table.rawDataCount} pasted).
              </FormInlineWarning>
            ) : null}

            {rows.length > 0 ? (
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
                      <TableHead className="overflow-hidden">
                        Platform
                      </TableHead>
                      <TableHead className="overflow-hidden">Status</TableHead>
                      <TableHead className="overflow-hidden">
                        Confidence
                      </TableHead>
                      <TableHead className="overflow-hidden px-1 text-center">
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
                                className={cn(
                                  "w-full",
                                  entityHint !== null && "text-destructive"
                                )}
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
                                      : identifierTypeSchema.parse(next),
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell className="min-w-0 overflow-hidden">
                            <EditableSuggestCell
                              value={row.platform}
                              options={IDENTIFIER_PLATFORM_OPTIONS}
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
                                  status: identifierStatusSchema.parse(next),
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
                                  confidence: confidenceTierSchema.parse(next),
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell className="overflow-hidden px-1 text-center">
                            {previewNote(row)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </>
        )}

        <FormInlineError>
          {importMutation.error
            ? errMessage(importMutation.error, "Failed to import")
            : null}
        </FormInlineError>

        <DialogFooter>
          {stage === "map" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStage("paste");
              }}
              disabled={busy}
            >
              Back
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                handleOpenChange(false);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          )}
          {stage === "paste" ? (
            <Button
              type="button"
              disabled={!canContinue}
              onClick={() => {
                setStage("map");
              }}
            >
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy || validRows.length === 0}
              onClick={() => {
                importMutation.mutate({ rows, table });
              }}
            >
              {`Import ${validRows.length} identifier${validRows.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
