import { BulkAddMapStage } from "@/domains/entities/components/bulk-add-map-stage";
import type { IdentifierPasteEntity } from "@/domains/entities/lib/parse-identifier-paste";
import { useBulkAddIdentifiersImport } from "@/domains/entities/lib/use-bulk-add-identifiers-import";
import { useBulkAddIdentifiersPaste } from "@/domains/entities/lib/use-bulk-add-identifiers-paste";
import { errMessage } from "@/lib/utils";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { FormInlineError } from "@/shared/ui/form-inline-message";
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
import { Textarea } from "@/shared/ui/shadcn/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  entities: readonly EntityOption[];
  lockEntity?: IdentifierPasteEntity | null;
  onImported?: (entityIds: string[]) => Promise<void>;
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

  const importMutation = useBulkAddIdentifiersImport({
    caseId,
    onImported,
    onClose: () => {
      handleOpenChange(false);
    },
    retainFailedImport,
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
          <BulkAddMapStage
            table={table}
            mapping={mapping}
            rows={rows}
            entityOptions={entityOptions}
            lockEntity={lockEntity}
            showPlatform={showPlatform}
            defaultEntityId={defaultEntityId}
            setDefaultEntityId={setDefaultEntityId}
            defaultPlatform={defaultPlatform}
            setDefaultPlatform={setDefaultPlatform}
            fieldOptions={fieldOptions}
            setColumnMapping={setColumnMapping}
            setRowPatch={setRowPatch}
            busy={busy}
          />
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
