import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { ListPlusIcon, PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import {
  HANDLE_REQUIRES_PLATFORM,
  isHandleWithoutPlatform,
  dossierIdentifierColumns,
  type IdentifierFieldUpdate,
  type IdentifierTableMeta,
} from "@/domains/dossier/components/identifiers-section.cells";
import {
  IdentifierComposerAppend,
  identifierCreateCanSubmit,
  useIdentifierCreateForm,
} from "@/domains/dossier/components/identifiers-section.composer";
import { useInvalidateEntity } from "@/domains/dossier/hooks/use-invalidate-entity";
import type { DossierSectionWithEvidenceProps } from "@/domains/dossier/types";
import { BulkAddIdentifiersDialog } from "@/domains/entities/components/bulk-add-identifiers-dialog";
import { DeleteIdentifierDialog } from "@/domains/entities/components/delete-identifier-dialog";
import {
  createIdentifierFn,
  updateIdentifierFn,
} from "@/domains/entities/identifiers/identifiers.functions";
import { identifiersListQuery } from "@/domains/entities/identifiers/queries";
import { copyIdentifierValue } from "@/domains/entities/lib/entity-export";
import type { EntityRecord } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import {
  DataTable,
  DataTableAddRow,
  DataTablePagination,
  tableComposerKeyDown,
  useDataTable,
} from "@/shared/ui/data-table";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { Button } from "@/shared/ui/shadcn/button";
import {
  normalizeIdentifierPlatform,
  type ConfidenceTier,
  type IdentifierStatus,
  type IdentifierType,
} from "@watchdog/schemas";

export type IdentifiersSectionProps = DossierSectionWithEvidenceProps & {
  entity: Pick<EntityRecord, "id" | "name" | "slug">;
};

export function IdentifiersSection({
  caseId,
  entityId,
  entitySlug,
  entity,
  evidenceOptions,
  onEvidenceClick,
  emptyPresentation = "inline",
}: IdentifiersSectionProps) {
  const invalidate = useInvalidateEntity({ caseId, entityId, entitySlug });
  const { data: rows } = useSuspenseQuery(
    identifiersListQuery(caseId, entityId)
  );
  const [composing, setComposing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    type: string;
    value: string;
  } | null>(null);
  const lockedEntity = { id: entity.id, name: entity.name, slug: entity.slug };

  const createForm = useIdentifierCreateForm(async ({ value, reset }) => {
    if (!identifierCreateCanSubmit(value)) {
      if (isHandleWithoutPlatform(value.type, value.platform)) {
        setSubmitError(HANDLE_REQUIRES_PLATFORM);
      }
      return;
    }
    setSubmitError(null);
    try {
      const platform = normalizeIdentifierPlatform(value.platform);
      await createIdentifierFn({
        data: {
          caseId,
          entityId,
          type: value.type,
          value: value.value.trim(),
          platform: platform || undefined,
          status: value.status,
          confidence: value.confidence,
          evidenceIds: value.evidenceIds,
        },
      });
      toast.success("Identifier added");
      reset();
      setComposing(false);
      await invalidate();
    } catch (error) {
      setSubmitError(errMessage(error, "Failed to add"));
    }
  });

  function closeComposer() {
    createForm.reset();
    setComposing(false);
  }

  const updateMutation = useMutation({
    mutationFn: async (input: {
      identifierId: string;
      value?: string;
      platform?: string;
      type?: IdentifierType;
      status?: IdentifierStatus;
      confidence?: ConfidenceTier;
      notes?: string;
      evidenceIds?: string[];
    }) => updateIdentifierFn({ data: { caseId, ...input } }),
    onSuccess: async () => {
      toast.success("Updated");
      await invalidate();
    },
    onError: (e) => toast.error(errMessage(e, "Update failed")),
  });

  function openComposer() {
    createForm.reset();
    setSubmitError(null);
    setComposing(true);
  }

  function submit() {
    void createForm.handleSubmit();
  }

  const updateField = useCallback(
    (identifierId: string, field: IdentifierFieldUpdate) => {
      updateMutation.mutate({ identifierId, ...field });
    },
    [updateMutation]
  );

  const saveEvidence = useCallback(
    async (identifierId: string, evidenceIds: string[]) => {
      await updateMutation.mutateAsync({ identifierId, evidenceIds });
    },
    [updateMutation]
  );

  function onComposerKey(e: React.KeyboardEvent) {
    const values = createForm.state.values;
    tableComposerKeyDown({
      busy: createForm.state.isSubmitting,
      canSubmit: identifierCreateCanSubmit(values),
      onSubmit: submit,
      onCancel: closeComposer,
    })(e);
  }

  const tableMeta: IdentifierTableMeta = {
    updateField,
    evidenceOptions,
    onEvidenceClick,
    saveEvidence,
    onCopyValue: (value) => {
      void (async () => {
        try {
          await copyIdentifierValue(value);
        } catch {
          toast.error("Couldn't copy");
        }
      })();
    },
    onDeleteIdentifier: (row) => {
      setDeleteTarget({ id: row.id, type: row.type, value: row.value });
    },
  };

  const identifierColumns = dossierIdentifierColumns;

  const { table } = useDataTable({
    data: rows,
    columns: identifierColumns,
    meta: tableMeta,
    getRowId: (r) => r.id,
    initialSorting: [{ id: "type", desc: false }],
    pageSize: 50,
  });

  const appendRow = composing ? (
    <IdentifierComposerAppend
      form={createForm}
      onKeyDown={onComposerKey}
      onSubmit={submit}
      onCancel={closeComposer}
      evidenceOptions={evidenceOptions}
    />
  ) : (
    <DataTableAddRow
      colSpan={identifierColumns.length}
      label="Add identifier…"
      onClick={openComposer}
    />
  );

  const isEmpty = rows.length === 0 && !composing;

  return (
    <>
      <DossierSection
        title="Identifiers"
        empty={isEmpty}
        emptyPresentation={emptyPresentation}
        emptyItems="identifiers"
        emptyText="No identifiers yet — add a handle, email, phone, or other ID."
        emptyDescription="Add handles, emails, phones, and other IDs."
        emptyAction={
          emptyPresentation === "panel" ? (
            <Button type="button" size="sm" onClick={openComposer}>
              <PlusIcon className="size-3.5" />
              Add identifier
            </Button>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => {
                setBulkOpen(true);
              }}
            >
              <ListPlusIcon className="size-3" />
              Bulk add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => {
                if (composing) {
                  closeComposer();
                } else {
                  openComposer();
                }
              }}
            >
              <PlusIcon className="size-3" />
              Add
            </Button>
          </div>
        }
      >
        <FormInlineError>{submitError}</FormInlineError>
        <div className="flex flex-col gap-2">
          <DataTable
            table={table}
            emptyText="No identifiers."
            appendRow={appendRow}
          />
          <DataTablePagination table={table} />
        </div>
      </DossierSection>
      <BulkAddIdentifiersDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        caseId={caseId}
        entities={[lockedEntity]}
        lockEntity={lockedEntity}
        onImported={invalidate}
      />
      <DeleteIdentifierDialog
        caseId={caseId}
        target={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </>
  );
}
