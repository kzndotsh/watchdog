import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { casesContextQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { useEntityTable } from "@/domains/entities/hooks/use-entity-table";
import { Page, PageHeader } from "@/shared/layout/page";
import { PageFilterMenu } from "@/shared/layout/page-filter-menu";
import { PageToolbar } from "@/shared/layout/page-toolbar";
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
import { EmptyState } from "@/shared/ui/empty-state";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { SearchField } from "@/shared/ui/search-field";
import { Button } from "@/shared/ui/shadcn/button";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
import { Label } from "@/shared/ui/shadcn/label";
import { TableCell } from "@/shared/ui/shadcn/table";
import { ENTITY_KIND_OPTIONS } from "@/shared/ui/vocab";
import { entityKindSchema, ENTITY_KINDS } from "@watchdog/schemas";

function EntityTableActive({ active }: { active: CaseRecord }) {
  const {
    rows,
    table,
    columns,
    createForm,
    search,
    setSearch,
    kindFilter,
    setKindFilter,
    submitError,
    composing,
    openComposer,
    closeComposer,
    submitCreate,
    onComposerKey,
    filterChips,
    emptyText,
    onRowClick,
    pending,
  } = useEntityTable(active);

  const appendRow = composing ? (
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
              className="font-medium"
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
                field.handleChange(entityKindSchema.parse(next));
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
            busy={isSubmitting}
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
    <Page className="gap-4">
      <PageHeader
        count={rows.length}
        countOn="entities"
        actions={
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (composing) {
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

      <FormInlineError>{submitError}</FormInlineError>

      <PageToolbar
        center={
          <>
            <SearchField
              value={search}
              onValueChange={setSearch}
              placeholder="Search entities…"
              aria-label="Search entities"
              className="max-w-md min-w-[12rem]"
            />
            <PageFilterMenu
              chips={filterChips}
              onClearAll={() => {
                setKindFilter([]);
              }}
              contentClassName="w-[16rem]"
            >
              <div className="space-y-2">
                <Label>Kind</Label>
                <div className="flex flex-col gap-2">
                  {ENTITY_KINDS.map((k) => {
                    const checked = kindFilter.includes(k);
                    return (
                      <label
                        key={k}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            setKindFilter(
                              value
                                ? [...kindFilter, k]
                                : kindFilter.filter((x) => x !== k)
                            );
                          }}
                        />
                        {k}
                      </label>
                    );
                  })}
                </div>
              </div>
            </PageFilterMenu>
          </>
        }
        trailing={<DataTableViewOptions table={table} />}
      />

      <DataTable
        table={table}
        emptyText={emptyText}
        appendRow={appendRow}
        pending={pending}
        pendingLabel="Loading entities table"
        onRowClick={(row) => {
          onRowClick(row);
        }}
      />
      <DataTablePagination table={table} />
    </Page>
  );
}

export function EntityTable() {
  const { data: casesCtx } = useSuspenseQuery(casesContextQuery());

  if (!casesCtx.active) {
    return (
      <Page>
        <PageHeader />
        <EmptyState
          intent="blank-slate"
          items="cases"
          title="No active case"
          description={
            <>
              <Link to="/cases" className="underline">
                Select a case
              </Link>{" "}
              to manage entities.
            </>
          }
        />
      </Page>
    );
  }

  return <EntityTableActive active={casesCtx.active} />;
}
