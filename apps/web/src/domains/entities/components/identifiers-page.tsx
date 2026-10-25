import { useQueryClient } from "@tanstack/react-query";
import { ListPlusIcon, PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import type { CaseRecord } from "@/domains/cases/types";
import { BulkAddIdentifiersDialog } from "@/domains/entities/components/bulk-add-identifiers-dialog";
import { DeleteIdentifierDialog } from "@/domains/entities/components/delete-identifier-dialog";
import { IdentifiersTableActionsProvider } from "@/domains/entities/components/identifiers-table.columns";
import { useIdentifiersTable } from "@/domains/entities/hooks/use-identifiers-table";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { Page } from "@/shared/layout/page";
import { PageFilterMenu } from "@/shared/layout/page-filter-menu";
import { PageHeader } from "@/shared/layout/page-header";
import { PageToolbar } from "@/shared/layout/page-toolbar";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import {
  DataTable,
  DataTableAddRow,
  DataTablePagination,
  DataTableViewOptions,
} from "@/shared/ui/data-table";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { IdentifierComposerAppend } from "@/shared/ui/identifiers/identifier-composer";
import { identifierRowActions } from "@/shared/ui/identifiers/identifier-row-actions";
import { Button } from "@/shared/ui/primitives/button";
import { SearchField } from "@/shared/ui/search-field";
import {
  CONFIDENCE_OPTIONS,
  IDENTIFIER_STATUS_OPTIONS,
  IDENTIFIER_TYPE_OPTIONS,
} from "@/shared/ui/vocab";
import { Checkbox } from "@watchdog/ui/components/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@watchdog/ui/components/field";

function IdentifiersActive({ active }: { active: CaseRecord }) {
  const {
    rows,
    table,
    tableActions,
    columns,
    createForm,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    confidenceFilter,
    setConfidenceFilter,
    submitError,
    isComposing,
    openComposer,
    closeComposer,
    submitCreate,
    onComposerKey,
    filterChips,
    emptyText,
    onRowClick,
    entityOptions,
    evidenceOptions,
    pending,
    identifiersPlaceholder,
    identifiersLoadError,
    retryTable,
    caseId,
    deleteTarget,
    setDeleteTarget,
  } = useIdentifiersTable(active);
  const queryClient = useQueryClient();
  const [isBulkOpen, setIsBulkOpen] = useState(false);

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
      entityPicker={{ entities: entityOptions }}
      evidenceOptions={evidenceOptions}
    />
  ) : (
    <DataTableAddRow
      colSpan={columns.length}
      label="Add identifier…"
      onClick={openComposer}
    />
  );

  return (
    <Page>
      <PageHeader
        count={rows.length}
        countOn="identifiers"
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
          </>
        }
      />

      <FieldError>{submitError}</FieldError>

      <PageToolbar
        center={
          <>
            <SearchField
              value={search}
              onValueChange={setSearch}
              placeholder="Search identifiers…"
              aria-label="Search identifiers"
            />
            <PageFilterMenu
              chips={filterChips}
              onClearAll={() => {
                setTypeFilter([]);
                setStatusFilter([]);
                setConfidenceFilter([]);
              }}
              contentClassName="w-[18rem] max-h-[min(28rem,70vh)] overflow-y-auto"
            >
              <FieldSet>
                <FieldLegend variant="label">Type</FieldLegend>
                <FieldGroup>
                  {IDENTIFIER_TYPE_OPTIONS.map((opt) => {
                    const checked = typeFilter.includes(opt.value);
                    const id = `identifier-type-${opt.value}`;
                    return (
                      <Field key={opt.value} orientation="horizontal">
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(value) => {
                            setTypeFilter(
                              value
                                ? [...typeFilter, opt.value]
                                : typeFilter.filter((x) => x !== opt.value)
                            );
                          }}
                        />
                        <FieldLabel htmlFor={id}>{opt.label}</FieldLabel>
                      </Field>
                    );
                  })}
                </FieldGroup>
              </FieldSet>
              <FieldSet>
                <FieldLegend variant="label">Status</FieldLegend>
                <FieldGroup>
                  {IDENTIFIER_STATUS_OPTIONS.map((opt) => {
                    const checked = statusFilter.includes(opt.value);
                    const id = `identifier-status-${opt.value}`;
                    return (
                      <Field key={opt.value} orientation="horizontal">
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(value) => {
                            setStatusFilter(
                              value
                                ? [...statusFilter, opt.value]
                                : statusFilter.filter((x) => x !== opt.value)
                            );
                          }}
                        />
                        <FieldLabel htmlFor={id}>{opt.label}</FieldLabel>
                      </Field>
                    );
                  })}
                </FieldGroup>
              </FieldSet>
              <FieldSet>
                <FieldLegend variant="label">Confidence</FieldLegend>
                <FieldGroup>
                  {CONFIDENCE_OPTIONS.map((opt) => {
                    const checked = confidenceFilter.includes(opt.value);
                    const id = `identifier-confidence-${opt.value}`;
                    return (
                      <Field key={opt.value} orientation="horizontal">
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(value) => {
                            setConfidenceFilter(
                              value
                                ? [...confidenceFilter, opt.value]
                                : confidenceFilter.filter(
                                    (x) => x !== opt.value
                                  )
                            );
                          }}
                        />
                        <FieldLabel htmlFor={id}>{opt.label}</FieldLabel>
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

      <div className={placeholderDeemphasisClass(identifiersPlaceholder)}>
        {identifiersLoadError ? (
          <FetchErrorAlert error={identifiersLoadError} onRetry={retryTable} />
        ) : (
          <IdentifiersTableActionsProvider value={tableActions}>
            <DataTable
              table={table}
              emptyText={emptyText}
              appendRow={appendRow}
              isPending={pending}
              pendingLabel="Loading identifiers table"
              getRowActions={getRowActions}
              onRowClick={onRowClick}
            />
          </IdentifiersTableActionsProvider>
        )}
      </div>
      <DataTablePagination table={table} />
      <BulkAddIdentifiersDialog
        open={isBulkOpen}
        onOpenChange={setIsBulkOpen}
        caseId={active.id}
        entities={entityOptions}
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

export function IdentifiersPage() {
  const active = useLiveWorkCase();

  return <IdentifiersActive active={active} />;
}
