import { useMemo } from "react";

import { BulkAddMapStage } from "@/domains/entities/components/bulk-add-map-stage";
import { useBulkAddIdentifiersImport } from "@/domains/entities/hooks/use-bulk-add-identifiers-import";
import { useBulkAddIdentifiersPaste } from "@/domains/entities/hooks/use-bulk-add-identifiers-paste";
import type { IdentifierPasteEntity } from "@/domains/entities/lib/parse-identifier-paste";
import { isIdentifierPasteRowImportable } from "@/domains/entities/lib/parse-identifier-paste";
import { entityPickerPort } from "@/domains/entities/queries";
import { errMessage } from "@/lib/utils";
import {
  TOAST_IMPORT_FAILED,
  TOAST_IMPORT_LOADING,
} from "@/shared/lib/toast-copy";
import { Button } from "@/shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";
import { toast } from "@/shared/ui/toast";
import { Field, FieldError, FieldLabel } from "@watchdog/ui/components/field";
import { Textarea } from "@watchdog/ui/components/textarea";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  lockEntity?: IdentifierPasteEntity | null;
  onImported?: (entityIds: string[], caseId: string) => Promise<void>;
};

export function BulkAddIdentifiersDialog({
  open,
  onOpenChange,
  caseId,
  lockEntity = null,
  onImported,
}: Props) {
  const pasteState = useBulkAddIdentifiersPaste({ caseId, lockEntity });
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
    pickEntity,
    isMatchingEntities,
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

  function handleOpenChange(isNextOpen: boolean) {
    if (!isNextOpen) resetForm();
    onOpenChange(isNextOpen);
  }

  const importMutation = useBulkAddIdentifiersImport({
    onImported,
    onClose: () => {
      handleOpenChange(false);
    },
    retainFailedImport,
  });

  const busy = importMutation.isPending;
  const entityPort = useMemo(() => entityPickerPort(caseId), [caseId]);

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
          <Field>
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
          <BulkAddMapStage
            table={table}
            mapping={mapping}
            rows={rows}
            entityPort={entityPort}
            onPickEntity={pickEntity}
            lockEntity={lockEntity}
            shouldShowPlatform={showPlatform}
            defaultEntityId={defaultEntityId}
            setDefaultEntityId={setDefaultEntityId}
            defaultPlatform={defaultPlatform}
            setDefaultPlatform={setDefaultPlatform}
            fieldOptions={fieldOptions}
            setColumnMapping={setColumnMapping}
            setRowPatch={setRowPatch}
            isBusy={busy}
          />
        )}

        <FieldError>
          {importMutation.error
            ? errMessage(importMutation.error, "Failed to import")
            : null}
        </FieldError>

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
              disabled={busy || isMatchingEntities || validRows.length === 0}
              onClick={() => {
                const input = { caseId, rows, table };
                void toast.promise(importMutation.mutateAsync(input), {
                  loading: TOAST_IMPORT_LOADING,
                  success: (result) => {
                    const invalidCount = rows.filter(
                      (row) => !isIdentifierPasteRowImportable(row)
                    ).length;
                    const skipped = result.failed.length + invalidCount;
                    const summary = `Imported ${result.imported} · ${skipped} skipped`;
                    if (result.imported === 0) {
                      return { title: summary, type: "error" };
                    }
                    return summary;
                  },
                  error: TOAST_IMPORT_FAILED,
                });
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
