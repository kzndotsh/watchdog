import { ListPlusIcon, PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { DossierSectionQueryGate } from "@/domains/dossier/components/dossier-section-query-gate";
import { useCreateIdentifier } from "@/domains/dossier/hooks/use-create-identifier";
import { useDossierSectionQuery } from "@/domains/dossier/hooks/use-dossier-section-query";
import { useInvalidateEntity } from "@/domains/dossier/hooks/use-invalidate-entity";
import { useUpdateIdentifier } from "@/domains/dossier/hooks/use-update-identifier";
import type { DossierSectionWithEvidenceProps } from "@/domains/dossier/types";
import { BulkAddIdentifiersDialog } from "@/domains/entities/components/bulk-add-identifiers-dialog";
import { DeleteIdentifierDialog } from "@/domains/entities/components/delete-identifier-dialog";
import { identifiersListQuery } from "@/domains/entities/identifiers/queries";
import type { IdentifierRecord } from "@/domains/entities/identifiers/types";
import { copyIdentifierValue } from "@/domains/entities/lib/entity-export";
import type { EntityRecord } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import type { AppAction } from "@/shared/lib/app-action";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { TOAST_COULDNT_COPY } from "@/shared/lib/toast-copy";
import {
  DataTable,
  DataTableAddRow,
  DataTablePagination,
  tableComposerKeyDown,
  useDataTable,
} from "@/shared/ui/data-table";
import {
  isHandleWithoutPlatform,
  dossierIdentifierColumns,
  type IdentifierFieldUpdate,
  type IdentifierTableMeta,
} from "@/shared/ui/identifiers/identifier-cells";
import {
  IdentifierComposerAppend,
  identifierCreateCanSubmit,
  useIdentifierCreateForm,
} from "@/shared/ui/identifiers/identifier-composer";
import { identifierRowActions } from "@/shared/ui/identifiers/identifier-row-actions";
import { Button } from "@/shared/ui/primitives/button";
import { DossierPanelSkeletonLayout } from "@/shared/ui/skeletons";
import { toast } from "@/shared/ui/toast";
import { HANDLE_REQUIRES_PLATFORM } from "@watchdog/schemas/graph";
import { FieldError } from "@watchdog/ui/components/field";

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
  const scope = useMemo(
    () => ({ caseId, entityId, entitySlug }),
    [caseId, entityId, entitySlug]
  );
  const invalidateEntity = useInvalidateEntity();
  const {
    data: rows,
    placeholder,
    pending,
    loadError,
    retry,
  } = useDossierSectionQuery(identifiersListQuery(caseId, entityId));
  const [isComposing, setIsComposing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    type: string;
    value: string;
    entityId: string;
    entitySlug: string;
  } | null>(null);
  const lockedEntity = { id: entity.id, name: entity.name, slug: entity.slug };

  const createMutation = useCreateIdentifier();

  const createForm = useIdentifierCreateForm(async ({ value, reset }) => {
    if (!identifierCreateCanSubmit(value)) {
      if (isHandleWithoutPlatform(value.type, value.platform)) {
        setSubmitError(HANDLE_REQUIRES_PLATFORM);
      }
      return;
    }
    setSubmitError(null);
    try {
      await createMutation.mutateAsync({ ...scope, value });
      reset();
      setIsComposing(false);
    } catch (error) {
      setSubmitError(errMessage(error, "Failed to add"));
    }
  });

  function closeComposer() {
    createForm.reset();
    setIsComposing(false);
  }

  const updateMutation = useUpdateIdentifier({
    onUpdated: () => {
      setUpdateError(null);
    },
    onError: setUpdateError,
  });

  function openComposer() {
    createForm.reset();
    setSubmitError(null);
    setIsComposing(true);
  }

  function submit() {
    void createForm.handleSubmit();
  }

  const updateField = useCallback(
    (identifierId: string, field: IdentifierFieldUpdate) => {
      updateMutation.mutate({ ...scope, patch: { identifierId, ...field } });
    },
    [scope, updateMutation]
  );

  const saveEvidence = useCallback(
    async (identifierId: string, evidenceIds: string[]) => {
      await updateMutation.mutateAsync({
        ...scope,
        patch: { identifierId, evidenceIds },
      });
    },
    [scope, updateMutation]
  );

  function onComposerKey(e: React.KeyboardEvent) {
    const values = createForm.state.values;
    tableComposerKeyDown({
      isBusy: createForm.state.isSubmitting,
      canSubmit: identifierCreateCanSubmit(values),
      onSubmit: submit,
      onCancel: closeComposer,
    })(e);
  }

  const tableMeta = useMemo<IdentifierTableMeta>(
    () => ({
      updateField,
      evidenceOptions,
      onEvidenceClick,
      saveEvidence,
      onCopyValue: (value) => {
        void (async () => {
          try {
            await copyIdentifierValue(value);
          } catch {
            toast.error(TOAST_COULDNT_COPY);
          }
        })();
      },
      onDeleteIdentifier: (row) => {
        setDeleteTarget({
          id: row.id,
          type: row.type,
          value: row.value,
          entityId,
          entitySlug: entity.slug,
        });
      },
    }),
    [
      entity.slug,
      entityId,
      evidenceOptions,
      onEvidenceClick,
      saveEvidence,
      updateField,
    ]
  );

  const getRowActions = useCallback(
    (row: IdentifierRecord): readonly AppAction[] =>
      identifierRowActions(row, tableMeta),
    [tableMeta]
  );

  const identifierColumns = dossierIdentifierColumns;

  const { table } = useDataTable({
    data: rows,
    columns: identifierColumns,
    meta: tableMeta,
    getRowId: (r) => r.id,
    initialSorting: [{ id: "type", desc: false }],
    pageSize: 50,
  });

  const appendRow = isComposing ? (
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

  const isEmpty = rows.length === 0 && !isComposing;

  return (
    <DossierSectionQueryGate
      loadError={loadError}
      isPending={pending}
      pendingFallback={
        emptyPresentation === "panel" ? (
          <DossierPanelSkeletonLayout variant="table" />
        ) : null
      }
      onRetry={retry}
    >
      <>
        <DossierSection
          title="Identifiers"
          className={placeholderDeemphasisClass(placeholder)}
          isEmpty={isEmpty}
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
                onClick={() => {
                  setIsBulkOpen(true);
                }}
              >
                <ListPlusIcon className="size-3" />
                Bulk add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (isComposing) {
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
          <FieldError>{submitError ?? updateError}</FieldError>
          <div className="flex flex-col gap-2">
            <DataTable
              table={table}
              emptyText="No identifiers."
              appendRow={appendRow}
              getRowActions={getRowActions}
            />
            <DataTablePagination table={table} />
          </div>
        </DossierSection>
        <BulkAddIdentifiersDialog
          open={isBulkOpen}
          onOpenChange={setIsBulkOpen}
          caseId={caseId}
          entities={[lockedEntity]}
          lockEntity={lockedEntity}
          onImported={async (importedEntityIds, importedCaseId) => {
            // The import's own Case and Entity ids: the screen may show another Entity by now.
            await Promise.all(
              importedEntityIds.map(async (importedEntityId) =>
                invalidateEntity({
                  caseId: importedCaseId,
                  entityId: importedEntityId,
                  entitySlug:
                    importedEntityId === scope.entityId
                      ? scope.entitySlug
                      : undefined,
                })
              )
            );
          }}
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
    </DossierSectionQueryGate>
  );
}
