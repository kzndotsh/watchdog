import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ListPlusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { casesContextQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { BulkAddIdentifiersDialog } from "@/domains/entities/components/bulk-add-identifiers-dialog";
import { useIdentifiersTable } from "@/domains/entities/hooks/use-identifiers-table";
import { Page, PageHeader } from "@/shared/layout/page";
import { PageFilterMenu } from "@/shared/layout/page-filter-menu";
import { PageToolbar } from "@/shared/layout/page-toolbar";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import {
  DataTable,
  DataTableAddRow,
  DataTablePagination,
  DataTableViewOptions,
} from "@/shared/ui/data-table";
import { EmptyState } from "@/shared/ui/empty-state";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import {
  IdentifierComposerAppend,
  IdentifierComposerEvidence,
} from "@/shared/ui/identifiers/identifier-composer";
import { SearchField } from "@/shared/ui/search-field";
import { Button } from "@/shared/ui/shadcn/button";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
import { Label } from "@/shared/ui/shadcn/label";
import {
  CONFIDENCE_OPTIONS,
  IDENTIFIER_STATUS_OPTIONS,
  IDENTIFIER_TYPE_OPTIONS,
} from "@/shared/ui/vocab";

function IdentifiersActive({ active }: { active: CaseRecord }) {
  const {
    rows,
    table,
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
    composing,
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
  } = useIdentifiersTable(active);
  const queryClient = useQueryClient();
  const [bulkOpen, setBulkOpen] = useState(false);

  const appendRow = composing ? (
    <IdentifierComposerAppend
      form={createForm}
      onKeyDown={onComposerKey}
      onSubmit={submitCreate}
      onCancel={closeComposer}
      entityPicker={{ entities: entityOptions }}
    />
  ) : (
    <DataTableAddRow
      colSpan={columns.length}
      label="Add identifier…"
      onClick={openComposer}
    />
  );

  return (
    <Page className="gap-4">
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
                setBulkOpen(true);
              }}
            >
              <ListPlusIcon className="size-3.5" />
              Bulk add
            </Button>
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
              Add identifier
            </Button>
          </>
        }
      />

      <FormInlineError>{submitError}</FormInlineError>

      <PageToolbar
        center={
          <>
            <SearchField
              value={search}
              onValueChange={setSearch}
              placeholder="Search identifiers…"
              aria-label="Search identifiers"
              className="max-w-md min-w-[12rem]"
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
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex flex-col gap-2">
                  {IDENTIFIER_TYPE_OPTIONS.map((opt) => {
                    const checked = typeFilter.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            setTypeFilter(
                              value
                                ? [...typeFilter, opt.value]
                                : typeFilter.filter((x) => x !== opt.value)
                            );
                          }}
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex flex-col gap-2">
                  {IDENTIFIER_STATUS_OPTIONS.map((opt) => {
                    const checked = statusFilter.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            setStatusFilter(
                              value
                                ? [...statusFilter, opt.value]
                                : statusFilter.filter((x) => x !== opt.value)
                            );
                          }}
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Confidence</Label>
                <div className="flex flex-col gap-2">
                  {CONFIDENCE_OPTIONS.map((opt) => {
                    const checked = confidenceFilter.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
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
                        {opt.label}
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

      <div className={placeholderDeemphasisClass(identifiersPlaceholder)}>
        <DataTable
          table={table}
          emptyText={emptyText}
          appendRow={appendRow}
          pending={pending}
          pendingLabel="Loading identifiers table"
          onRowClick={onRowClick}
        />
      </div>
      {composing ? (
        <IdentifierComposerEvidence
          form={createForm}
          evidenceOptions={evidenceOptions}
        />
      ) : null}
      <DataTablePagination table={table} />
      <BulkAddIdentifiersDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        caseId={active.id}
        entities={entityOptions}
        onImported={async () => {
          await invalidateAfterEntityChanged(queryClient, active.id);
        }}
      />
    </Page>
  );
}

export function IdentifiersPage() {
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
              to manage identifiers.
            </>
          }
        />
      </Page>
    );
  }

  return <IdentifiersActive active={casesCtx.active} />;
}
