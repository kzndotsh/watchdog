import { ListPlusIcon, PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { RowHistory } from "@/domains/dossier/components/row-history";
import { useCreateIdentifier } from "@/domains/dossier/hooks/use-create-identifier";
import { useInvalidateEntity } from "@/domains/dossier/hooks/use-invalidate-entity";
import {
  useSectionListView,
  type SectionListView,
} from "@/domains/dossier/hooks/use-section-list-view";
import { useUpdateIdentifier } from "@/domains/dossier/hooks/use-update-identifier";
import type { DossierIdentifiersSearch } from "@/domains/dossier/lib/dossier-tabs";
import type { DossierSectionWithEvidenceProps } from "@/domains/dossier/types";
import { LazyBulkAddIdentifiersDialog } from "@/domains/entities/components/bulk-add-identifiers-dialog-lazy";
import { warmBulkAddDialog } from "@/domains/entities/components/bulk-add-identifiers-dialog-load";
import { DeleteIdentifierDialog } from "@/domains/entities/components/delete-identifier-dialog";
import { identifierListView } from "@/domains/entities/identifiers/queries";
import type { IdentifierRecord } from "@/domains/entities/identifiers/types";
import { copyIdentifierValue } from "@/domains/entities/lib/entity-export";
import type { EntityRecord } from "@/domains/entities/types";
import { evidencePickerPort } from "@/domains/intake/queries";
import { errMessage } from "@/lib/utils";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { useListTable } from "@/shared/hooks/list/use-list-table";
import { useRecordsByIds } from "@/shared/hooks/use-picker-source";
import type { AppAction } from "@/shared/lib/app-action";
import { TOAST_COULDNT_COPY } from "@/shared/lib/toast-copy";
import { DataTableAddRow, tableComposerKeyDown } from "@/shared/ui/data-table";
import {
  isHandleWithoutPlatform,
  dossierIdentifierColumns,
  IdentifierTableActionsProvider,
  type IdentifierEditTarget,
  type IdentifierFieldUpdate,
  type IdentifierTableActions,
} from "@/shared/ui/identifiers/identifier-cells";
import {
  identifierCreateCanSubmit,
  useIdentifierCreateForm,
} from "@/shared/ui/identifiers/identifier-composer";
import { LazyIdentifierComposerAppend } from "@/shared/ui/identifiers/identifier-composer-lazy";
import { warmComposer } from "@/shared/ui/identifiers/identifier-composer-load";
import { identifierRowActions } from "@/shared/ui/identifiers/identifier-row-actions";
import { ListTable, ListToolbar } from "@/shared/ui/list";
import { Button } from "@/shared/ui/primitives/button";
import { toast } from "@/shared/ui/toast";
import {
  HANDLE_REQUIRES_PLATFORM,
  type identifierList,
} from "@watchdog/schemas/graph";
import type { UnfixedSearchPatch } from "@watchdog/schemas/shared";
import { FieldError } from "@watchdog/ui/components/field";

/** The Identifiers tab's view in the route's URL (the Overview's nest keeps its own). */
export type IdentifiersSectionView = SectionListView<
  DossierIdentifiersSearch,
  UnfixedSearchPatch<typeof identifierList, "entityId">
>;

export type IdentifiersSectionProps = DossierSectionWithEvidenceProps & {
  entity: Pick<EntityRecord, "id" | "name" | "slug">;
  /** The tab's URL view and toolbar; without it the section shows the default view, sortable in place. */
  view?: IdentifiersSectionView;
};

const NO_SEARCH: DossierIdentifiersSearch = {};

export function IdentifiersSection({
  caseId,
  entityId,
  entitySlug,
  entity,
  onEvidenceClick,
  emptyPresentation = "inline",
  view,
}: IdentifiersSectionProps) {
  const scope = useMemo(
    () => ({ caseId, entityId, entitySlug }),
    [caseId, entityId, entitySlug]
  );
  const invalidateEntity = useInvalidateEntity();
  const { search, onSearchChange } = useSectionListView(view, NO_SEARCH);
  const list = useList(identifierListView, {
    scope: { caseId },
    fixed: { entityId },
    search,
    onSearchChange,
  });
  const display = useListDisplay("dossier-identifiers");
  const evidencePort = useMemo(() => evidencePickerPort(caseId), [caseId]);
  // The Evidence cell names each row's first link: titles of those ids on the loaded page only.
  const evidenceTitles = useRecordsByIds(
    evidencePort,
    list.rows.flatMap((row) => row.evidenceIds.slice(0, 1))
  );
  const evidence = useMemo(
    () => ({ port: evidencePort, titles: evidenceTitles }),
    [evidencePort, evidenceTitles]
  );
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

  function handleCloseComposer() {
    createForm.reset();
    setIsComposing(false);
  }

  const updateMutation = useUpdateIdentifier({
    onUpdated: () => {
      setUpdateError(null);
    },
    onError: setUpdateError,
  });

  function handleOpenComposer() {
    createForm.reset();
    setSubmitError(null);
    setIsComposing(true);
  }

  function handleSubmit() {
    void createForm.handleSubmit();
  }

  const updateField = useCallback(
    (target: IdentifierEditTarget, field: IdentifierFieldUpdate) => {
      updateMutation.mutate({
        ...scope,
        patch: {
          identifierId: target.id,
          expectedVersion: target.version,
          ...field,
        },
      });
    },
    [scope, updateMutation]
  );

  const saveEvidence = useCallback(
    async (target: IdentifierEditTarget, evidenceIds: string[]) => {
      await updateMutation.mutateAsync({
        ...scope,
        patch: {
          identifierId: target.id,
          expectedVersion: target.version,
          evidenceIds,
        },
      });
    },
    [scope, updateMutation]
  );

  const saveNotes = useCallback(
    async (target: IdentifierEditTarget, notes: string) => {
      await updateMutation.mutateAsync({
        ...scope,
        patch: {
          identifierId: target.id,
          expectedVersion: target.version,
          notes,
        },
      });
    },
    [scope, updateMutation]
  );

  function handleComposerKey(e: React.KeyboardEvent) {
    const values = createForm.state.values;
    tableComposerKeyDown({
      isBusy: createForm.state.isSubmitting,
      canSubmit: identifierCreateCanSubmit(values),
      onSubmit: handleSubmit,
      onCancel: handleCloseComposer,
    })(e);
  }

  const tableActions = useMemo<IdentifierTableActions>(
    () => ({
      updateField,
      evidence,
      onEvidenceClick,
      saveEvidence,
      saveNotes,
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
      renderHistory: (row) => (
        <RowHistory caseId={caseId} kind="identifier" rowId={row.id} />
      ),
    }),
    [
      caseId,
      entity.slug,
      entityId,
      evidence,
      onEvidenceClick,
      saveEvidence,
      saveNotes,
      updateField,
    ]
  );

  const getRowActions = useCallback(
    (row: IdentifierRecord): readonly AppAction[] =>
      identifierRowActions(row, tableActions),
    [tableActions]
  );

  const identifierColumns = dossierIdentifierColumns;
  const { table } = useListTable(list, {
    columns: identifierColumns,
    sortColumns: { value: "value" },
    display,
  });

  const addRow = (
    <DataTableAddRow
      colSpan={identifierColumns.length}
      label="Add identifier…"
      onClick={handleOpenComposer}
      onIntent={warmComposer}
    />
  );
  const appendRow = isComposing ? (
    <LazyIdentifierComposerAppend
      fallback={addRow}
      form={createForm}
      onKeyDown={handleComposerKey}
      onSubmit={handleSubmit}
      onCancel={handleCloseComposer}
      evidencePort={evidencePort}
    />
  ) : (
    addRow
  );

  // The Overview's nest reads "None" inline; the tab's table shows the list's own empty states.
  const isEmpty =
    emptyPresentation === "inline" && list.status === "blank" && !isComposing;
  const addButton = (
    <Button
      type="button"
      size="sm"
      onClick={handleOpenComposer}
      onPointerEnter={warmComposer}
      onFocus={warmComposer}
    >
      <PlusIcon className="size-3.5" />
      Add identifier
    </Button>
  );

  return (
    <>
      <DossierSection
        title="Identifiers"
        isEmpty={isEmpty}
        emptyPresentation={emptyPresentation}
        emptyText="No identifiers yet — add a handle, email, phone, or other ID."
        actions={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onPointerEnter={warmBulkAddDialog}
              onFocus={warmBulkAddDialog}
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
                  handleCloseComposer();
                } else {
                  handleOpenComposer();
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
          {view === undefined ? null : (
            <ListToolbar list={list} display={display} table={table} />
          )}
          <IdentifierTableActionsProvider value={tableActions}>
            <ListTable
              list={list}
              table={table}
              density={display.density}
              appendRow={appendRow}
              blankSlateAction={addButton}
              getRowActions={getRowActions}
            />
          </IdentifierTableActionsProvider>
        </div>
      </DossierSection>
      <LazyBulkAddIdentifiersDialog
        open={isBulkOpen}
        onOpenChange={setIsBulkOpen}
        caseId={caseId}
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
  );
}
