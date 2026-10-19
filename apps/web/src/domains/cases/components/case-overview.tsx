import { useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckIcon, DownloadIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { CaseOverviewPending } from "@/domains/cases/components/case-overview-pending";
import { CaseOverviewTab } from "@/domains/cases/components/case-overview-tab";
import { DeleteCaseDialog } from "@/domains/cases/components/delete-case-dialog";
import { useCaseDeletedToast } from "@/domains/cases/hooks/use-case-deleted-toast";
import { useSelectActiveCase } from "@/domains/cases/hooks/use-select-active-case";
import { useUpdateCase } from "@/domains/cases/hooks/use-update-case";
import {
  caseByIdQuery,
  casesContextQuery,
  deletionPolicyQuery,
} from "@/domains/cases/queries";
import { identifiersForCaseQuery } from "@/domains/entities/identifiers/queries";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { caseExportZipPath } from "@/shared/lib/api-urls";
import { listPending } from "@/shared/lib/list-pending";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";
import { Chip } from "@/shared/ui/chip";
import { EditableTextCell } from "@/shared/ui/data-table";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { Button } from "@/shared/ui/primitives/button";
import { toast } from "@/shared/ui/toast";
import { WithTooltip } from "@/shared/ui/with-tooltip";

const EMPTY_ENTITIES: EntityRecord[] = [];
const EMPTY_IDENTIFIERS: CaseIdentifierRecord[] = [];

export function CaseOverview({ caseId }: { caseId: string }) {
  const navigate = useNavigate();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const showDeletedToast = useCaseDeletedToast();

  const [caseQuery, casesCtxQuery, policyQuery] = useQueries({
    queries: [
      caseByIdQuery(caseId),
      casesContextQuery(),
      deletionPolicyQuery(),
    ] as const,
  });
  const caseRow = caseQuery.data;
  // Delete is for owners and admins; the server enforces it too.
  const policy = policyQuery.data;
  const canDelete = policy?.canManage === true;
  const casesCtx = casesCtxQuery.data;
  const headerPending = listPending(caseQuery) || listPending(casesCtxQuery);
  const headerLoadError = combinedQueryLoadError(
    [caseQuery, casesCtxQuery],
    headerPending,
    "Failed to load case"
  );
  const handleRetryHeader = () => {
    if (caseQuery.isError) void caseQuery.refetch();
    if (casesCtxQuery.isError) void casesCtxQuery.refetch();
  };

  const entitiesQuery = useQuery(entitiesListQuery(caseId));
  const identifiersQuery = useQuery(identifiersForCaseQuery(caseId));
  const entities = entitiesQuery.data ?? EMPTY_ENTITIES;
  const identifiers = identifiersQuery.data ?? EMPTY_IDENTIFIERS;
  const listsPending =
    listPending(entitiesQuery) || listPending(identifiersQuery);
  const listsPlaceholder =
    entitiesQuery.isPlaceholderData || identifiersQuery.isPlaceholderData;
  const listsLoadError = combinedQueryLoadError(
    [entitiesQuery, identifiersQuery],
    listsPending,
    "Failed to load case overview"
  );
  const handleRetryLists = () => {
    if (entitiesQuery.isError) void entitiesQuery.refetch();
    if (identifiersQuery.isError) void identifiersQuery.refetch();
  };

  const renameMutation = useUpdateCase(caseId, caseRow?.slug);
  /** Bumped when a rename fails so the editor drops its unsaved draft. */
  const [nameEditorKey, setNameEditorKey] = useState(0);
  const selectMutation = useSelectActiveCase({ cases: casesCtx?.cases ?? [] });

  if (headerLoadError) {
    return (
      <Page>
        <PageHeader />
        <FetchErrorAlert error={headerLoadError} onRetry={handleRetryHeader} />
      </Page>
    );
  }

  if (headerPending) {
    return (
      <Page>
        <PageHeader />
        <CaseOverviewPending />
      </Page>
    );
  }

  if (!caseRow) {
    return null;
  }

  const isActive = casesCtx?.active?.id === caseId;

  let overviewBody: ReactNode;
  if (listsLoadError) {
    overviewBody = (
      <FetchErrorAlert error={listsLoadError} onRetry={handleRetryLists} />
    );
  } else if (listsPending) {
    overviewBody = <CaseOverviewPending />;
  } else {
    overviewBody = (
      <CaseOverviewTab
        caseId={caseId}
        caseRow={caseRow}
        entities={entities}
        identifiers={identifiers}
        isListsPending={listsPending}
        isListsPlaceholder={listsPlaceholder}
      />
    );
  }

  return (
    <Page>
      <PageHeader
        current={
          <EditableTextCell
            key={nameEditorKey}
            value={caseRow.name}
            aria-label="Case name"
            placeholder="Case name…"
            disabled={renameMutation.isPending}
            variant="title"
            className="w-auto max-w-[min(28rem,50vw)] min-w-[6rem]"
            onCommit={(next) => {
              const name = next.trim();
              if (!name) return false;
              if (name === caseRow.name) return false;
              renameMutation.mutate(
                { name },
                {
                  onError: () => {
                    setNameEditorKey((k) => k + 1);
                  },
                }
              );
              return true;
            }}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            {isActive ? (
              <Chip size="sm">
                <CheckIcon className="size-2.5" />
                Active
              </Chip>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={selectMutation.isPending}
                onClick={() => {
                  selectMutation.mutate(caseId, {
                    onSuccess: () => {
                      toast.success("Active Case set");
                    },
                  });
                }}
              >
                Set Active
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const a = document.createElement("a");
                a.href = caseExportZipPath(caseId);
                a.click();
              }}
            >
              <DownloadIcon className="size-3.5" />
              Export
            </Button>
            <WithTooltip
              content={
                policy !== undefined && !canDelete
                  ? "Only owners and admins can delete a Case."
                  : null
              }
              shouldWrapSpan
            >
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!canDelete}
                onClick={() => {
                  setIsDeleteOpen(true);
                }}
              >
                Delete
              </Button>
            </WithTooltip>
          </div>
        }
      />

      {overviewBody}

      <DeleteCaseDialog
        caseRow={caseRow}
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onDeleted={(deleted) => {
          showDeletedToast(deleted);
          void navigate({ to: "/cases" });
        }}
      />
    </Page>
  );
}
