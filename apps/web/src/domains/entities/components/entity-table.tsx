import { PlusIcon } from "lucide-react";
import { useCallback } from "react";

import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import type { CaseRecord } from "@/domains/cases/types";
import { DeleteEntityDialog } from "@/domains/entities/components/delete-entity-dialog";
import { EntityTableActionsProvider } from "@/domains/entities/components/entity-table.columns";
import { useEntityTable } from "@/domains/entities/hooks/use-entity-table";
import { entityRowActions } from "@/domains/entities/lib/entity-row-actions";
import type { EntityRecord } from "@/domains/entities/types";
import { Page } from "@/shared/layout/page";
import { PageFilterMenu } from "@/shared/layout/page-filter-menu";
import { PageHeader } from "@/shared/layout/page-header";
import { PageToolbar } from "@/shared/layout/page-toolbar";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import {
  DataTable,
  DataTableAddRow,
  DataTableComposerActions,
  DataTableComposerRow,
  DataTablePagination,
  DataTableViewOptions,
  EditableSelectCell,
  TableComposerInput,
} from "@/shared/ui/data-table";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { Button } from "@/shared/ui/primitives/button";
import { SearchField } from "@/shared/ui/search-field";
import { ENTITY_KIND_OPTIONS } from "@/shared/ui/vocab";
import {
  trimmedEntityKindSchema,
  ENTITY_KINDS,
  ENTITY_KIND_LABELS,
} from "@watchdog/schemas/shared";
import { Checkbox } from "@watchdog/ui/components/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@watchdog/ui/components/field";
import { TableCell } from "@watchdog/ui/components/table";

function EntityTableActive({ active }: { active: CaseRecord }) {
  const {
    rows,
    table,
    tableActions,
    columns,
    createForm,
    search,
    setSearch,
    kindFilter,
    setKindFilter,
    submitError,
    isComposing,
    openComposer,
    closeComposer,
    submitCreate,
    onComposerKey,
    filterChips,
    emptyText,
    onRowClick,
    pending,
    tableLoadError,
    retryTable,
    entitiesPlaceholder,
    caseId,
    deleteTarget,
    setDeleteTarget,
  } = useEntityTable(active);

  const getRowActions = useCallback(
    (row: EntityRecord) => entityRowActions(row, tableActions),
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
            colSpan={4}
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

  return (
    <Page>
      <PageHeader
        count={rows.length}
        countOn="entities"
        actions={
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
        }
      />

      <FieldError>{submitError}</FieldError>

      <PageToolbar
        center={
          <>
            <SearchField
              value={search}
              onValueChange={setSearch}
              placeholder="Search entities…"
              aria-label="Search entities"
            />
            <PageFilterMenu
              chips={filterChips}
              onClearAll={() => {
                setKindFilter([]);
              }}
            >
              <FieldSet>
                <FieldLegend variant="label">Kind</FieldLegend>
                <FieldGroup>
                  {ENTITY_KINDS.map((k) => {
                    const checked = kindFilter.includes(k);
                    const id = `entity-kind-${k}`;
                    return (
                      <Field key={k} orientation="horizontal">
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(value) => {
                            setKindFilter(
                              value
                                ? [...kindFilter, k]
                                : kindFilter.filter((x) => x !== k)
                            );
                          }}
                        />
                        <FieldLabel htmlFor={id}>
                          {ENTITY_KIND_LABELS[k]}
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </FieldGroup>
              </FieldSet>
            </PageFilterMenu>
          </>
        }
        trailing={<DataTableViewOptions table={table} />}
      />

      <div className={placeholderDeemphasisClass(entitiesPlaceholder)}>
        {tableLoadError ? (
          <FetchErrorAlert error={tableLoadError} onRetry={retryTable} />
        ) : (
          <EntityTableActionsProvider value={tableActions}>
            <DataTable
              table={table}
              emptyText={emptyText}
              appendRow={appendRow}
              isPending={pending}
              pendingLabel="Loading entities table"
              getRowActions={getRowActions}
              onRowClick={(row) => {
                onRowClick(row);
              }}
            />
          </EntityTableActionsProvider>
        )}
      </div>
      <DataTablePagination table={table} />

      <DeleteEntityDialog
        caseId={caseId}
        entity={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </Page>
  );
}

export function EntityTable() {
  const active = useLiveWorkCase();

  return <EntityTableActive active={active} />;
}
