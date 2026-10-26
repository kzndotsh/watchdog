import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlusIcon, PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import type { CaseRecord } from "@/domains/cases/types";
import { BulkAddIdentifiersDialog } from "@/domains/entities/components/bulk-add-identifiers-dialog";
import { DeleteIdentifierDialog } from "@/domains/entities/components/delete-identifier-dialog";
import { IdentifiersTableActionsProvider } from "@/domains/entities/components/identifiers-table.columns";
import {
  useIdentifiersTable,
  type IdentifiersTableSearch,
} from "@/domains/entities/hooks/use-identifiers-table";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { entityOptionsFromRecords } from "@/domains/entities/lib/entity-options";
import { entitiesListQuery } from "@/domains/entities/queries";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { DataTableAddRow } from "@/shared/ui/data-table";
import { IdentifierComposerAppend } from "@/shared/ui/identifiers/identifier-composer";
import { identifierRowActions } from "@/shared/ui/identifiers/identifier-row-actions";
import { ListCount, ListTable, ListToolbar } from "@/shared/ui/list";
import { Button } from "@/shared/ui/primitives/button";
import { FieldError } from "@watchdog/ui/components/field";

type IdentifiersActiveProps = IdentifiersTableSearch & { active: CaseRecord };

function IdentifiersActive({
  active,
  search,
  onSearchChange,
}: IdentifiersActiveProps) {
  const {
    list,
    table,
    display,
    entitySource,
    tableActions,
    columns,
    createForm,
    submitError,
    isComposing,
    openComposer,
    closeComposer,
    submitCreate,
    onComposerKey,
    onRowClick,
    entityPort,
    evidencePort,
    caseId,
    deleteTarget,
    setDeleteTarget,
  } = useIdentifiersTable(active, { search, onSearchChange });
  const queryClient = useQueryClient();
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  // Bulk add matches pasted names to Entities in the browser, so it reads the Case's Entities,
  // but only while its dialog is open: the table itself never does.
  const bulkEntitiesQuery = useQuery({
    ...entitiesListQuery(active.id),
    enabled: isBulkOpen,
  });
  const bulkEntities = useMemo(
    () => entityOptionsFromRecords(bulkEntitiesQuery.data ?? []),
    [bulkEntitiesQuery.data]
  );

  const getRowActions = useCallback(
    (row: CaseIdentifierRecord) => identifierRowActions(row, tableActions),
    [tableActions]
  );

  const appendRow = isComposing ? (
    <IdentifierComposerAppend
      form={createForm}
      onKeyDown={onComposerKey}
      onSubmit={submitCreate}
      onCancel={closeComposer}
      entityPicker={{ port: entityPort }}
      evidencePort={evidencePort}
    />
  ) : (
    <DataTableAddRow
      colSpan={columns.length}
      label="Add identifier…"
      onClick={openComposer}
    />
  );

  const addButton = (
    <Button
      type="button"
      size="sm"
      onClick={() => {
        if (isComposing) {
          closeComposer();
        } else {
          openComposer();
        }
      }}
    >
      <PlusIcon className="size-3.5" />
      Add identifier
    </Button>
  );

  return (
    <Page>
      <PageHeader
        count={
          <ListCount
            count={list.count}
            noun={list.def.noun}
            variant="compact"
            isLive={false}
          />
        }
        countOn="identifiers"
      />

      <FieldError>{submitError}</FieldError>

      <ListToolbar
        list={list}
        display={display}
        table={table}
        isSortShown
        sources={{ entityId: entitySource }}
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setIsBulkOpen(true);
              }}
            >
              <ListPlusIcon className="size-3.5" />
              Bulk add
            </Button>
            {addButton}
          </>
        }
      />

      <IdentifiersTableActionsProvider value={tableActions}>
        <ListTable
          list={list}
          table={table}
          density={display.density}
          appendRow={appendRow}
          blankSlateAction={addButton}
          getRowActions={getRowActions}
          onRowClick={onRowClick}
        />
      </IdentifiersTableActionsProvider>
      <BulkAddIdentifiersDialog
        open={isBulkOpen}
        onOpenChange={setIsBulkOpen}
        caseId={active.id}
        entities={bulkEntities}
        onImported={async (_entityIds, importedCaseId) => {
          await invalidateAfterEntityChanged(queryClient, importedCaseId);
        }}
      />
      <DeleteIdentifierDialog
        caseId={caseId}
        target={
          deleteTarget
            ? {
                id: deleteTarget.id,
                type: deleteTarget.type,
                value: deleteTarget.value,
                entityId: deleteTarget.entityId,
                entitySlug: deleteTarget.entitySlug,
              }
            : null
        }
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </Page>
  );
}

/** The Identifiers table; its route owns the view (`identifierList.searchWith`, `usePatchSearch`). */
export function IdentifiersPage({
  search,
  onSearchChange,
}: IdentifiersTableSearch) {
  const active = useLiveWorkCase();

  return (
    <IdentifiersActive
      active={active}
      search={search}
      onSearchChange={onSearchChange}
    />
  );
}
