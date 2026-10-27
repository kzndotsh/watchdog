import { PlusIcon } from "lucide-react";
import { lazy, Suspense, useCallback } from "react";

import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import type { CaseRecord } from "@/domains/cases/types";
import { EntityTableActionsProvider } from "@/domains/entities/components/entity-table.columns";
import {
  useEntityTable,
  type EntityTableSearch,
} from "@/domains/entities/hooks/use-entity-table";
import { entityRowActions } from "@/domains/entities/lib/entity-row-actions";
import type { EntityListItem } from "@/domains/entities/types";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import {
  DataTableAddRow,
  DataTableComposerActions,
  DataTableComposerRow,
  EditableSelectCell,
  TableComposerInput,
} from "@/shared/ui/data-table";
import { ListCount, ListTable, ListToolbar } from "@/shared/ui/list";
import { Button } from "@/shared/ui/primitives/button";
import { ENTITY_KIND_OPTIONS } from "@/shared/ui/vocab";
import { trimmedEntityKindSchema } from "@watchdog/schemas/shared";
import { FieldError } from "@watchdog/ui/components/field";
import { TableCell } from "@watchdog/ui/components/table";

// The delete dialog opens on a click, so it loads then.
const LoadedDeleteDialog = lazy(async () => {
  const { DeleteEntityDialog } =
    await import("@/domains/entities/components/delete-entity-dialog");
  return { default: DeleteEntityDialog };
});

type EntityTableActiveProps = EntityTableSearch & { active: CaseRecord };

function EntityTableActive({
  active,
  search,
  onSearchChange,
}: EntityTableActiveProps) {
  const {
    list,
    table,
    display,
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
    caseId,
    deleteTarget,
    setDeleteTarget,
  } = useEntityTable(active, { search, onSearchChange });

  const getRowActions = useCallback(
    (row: EntityListItem) => entityRowActions(row, tableActions),
    [tableActions]
  );

  const appendRow = isComposing ? (
    <DataTableComposerRow>
      <TableCell>
        <createForm.Field
          name="name"
          validators={{
            onSubmit: ({ value }) =>
              value.trim() ? undefined : "Enter an entity name",
          }}
        >
          {(field) => (
            <TableComposerInput
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              onKeyDown={onComposerKey}
              placeholder="Entity name…"
              autoFocus
              disabled={createForm.state.isSubmitting}
              aria-label="Entity name"
            />
          )}
        </createForm.Field>
      </TableCell>
      <TableCell>
        <createForm.Field name="kind">
          {(field) => (
            <EditableSelectCell
              value={field.state.value}
              options={ENTITY_KIND_OPTIONS}
              onCommit={(next) => {
                field.handleChange(trimmedEntityKindSchema.parse(next));
              }}
              disabled={createForm.state.isSubmitting}
              onKeyDown={onComposerKey}
              aria-label="Entity kind"
            />
          )}
        </createForm.Field>
      </TableCell>
      <createForm.Subscribe
        selector={(state) => ({
          isSubmitting: state.isSubmitting,
          name: state.values.name,
        })}
      >
        {({ isSubmitting, name }) => (
          <DataTableComposerActions
            isBusy={isSubmitting}
            canSubmit={Boolean(name.trim())}
            onSubmit={submitCreate}
            onCancel={closeComposer}
            colSpan={columns.length - 2}
          />
        )}
      </createForm.Subscribe>
    </DataTableComposerRow>
  ) : (
    <DataTableAddRow
      colSpan={columns.length}
      label="Add entity…"
      onClick={openComposer}
    />
  );

  const createButton = (
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
      Create
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
        countOn="entities"
      />

      <FieldError>{submitError}</FieldError>

      <ListToolbar
        list={list}
        display={display}
        table={table}
        isSortShown
        actions={createButton}
      />

      <EntityTableActionsProvider value={tableActions}>
        <ListTable
          list={list}
          table={table}
          density={display.density}
          appendRow={appendRow}
          blankSlateAction={createButton}
          getRowActions={getRowActions}
          onRowClick={onRowClick}
        />
      </EntityTableActionsProvider>

      {deleteTarget === null ? null : (
        <Suspense fallback={null}>
          <LoadedDeleteDialog
            caseId={caseId}
            entity={deleteTarget}
            open
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null);
            }}
          />
        </Suspense>
      )}
    </Page>
  );
}

/** The Entities table; its route owns the view (`entityList.searchWith`, `usePatchSearch`). */
export function EntityTable({ search, onSearchChange }: EntityTableSearch) {
  const active = useLiveWorkCase();

  return (
    <EntityTableActive
      active={active}
      search={search}
      onSearchChange={onSearchChange}
    />
  );
}
