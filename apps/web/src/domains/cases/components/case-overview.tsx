import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckIcon, DownloadIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { setActiveCaseIdFn } from "@/domains/cases/cases.functions";
import { CaseOverviewPending } from "@/domains/cases/components/case-overview-pending";
import { CaseOverviewTab } from "@/domains/cases/components/case-overview-tab";
import { DeleteCaseDialog } from "@/domains/cases/components/delete-case-dialog";
import { notifyCasesChanged } from "@/domains/cases/lib/active-case";
import { caseByIdQuery, casesContextQuery } from "@/domains/cases/queries";
import { setActiveCaseIdInputSchema } from "@/domains/cases/types";
import { identifiersForCaseQuery } from "@/domains/entities/identifiers/queries";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import { Page, PageHeader } from "@/shared/layout/page";
import { listPending } from "@/shared/lib/list-pending";
import {
  bindCasesChangedInvalidation,
  invalidateAfterCaseSwitch,
} from "@/shared/lib/query-invalidation";
import { DetailStatusChip } from "@/shared/ui/detail-status-chip";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { Button } from "@/shared/ui/shadcn/button";

const EMPTY_ENTITIES: EntityRecord[] = [];
const EMPTY_IDENTIFIERS: CaseIdentifierRecord[] = [];

export function CaseOverview({ caseId }: { caseId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [caseQuery, casesCtxQuery] = useQueries({
    queries: [caseByIdQuery(caseId), casesContextQuery()] as const,
  });
  const caseRow = caseQuery.data;
  const casesCtx = casesCtxQuery.data;
  const headerPending = listPending(caseQuery) || listPending(casesCtxQuery);
  const headerLoadError =
    !headerPending && (caseQuery.isError || casesCtxQuery.isError)
      ? errMessage(
          caseQuery.error ?? casesCtxQuery.error,
          "Failed to load case"
        )
      : null;
  const retryHeader = () => {
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
  const listsLoadError =
    !listsPending && (entitiesQuery.isError || identifiersQuery.isError)
      ? errMessage(
          entitiesQuery.error ?? identifiersQuery.error,
          "Failed to load case overview"
        )
      : null;
  const retryLists = () => {
    if (entitiesQuery.isError) void entitiesQuery.refetch();
    if (identifiersQuery.isError) void identifiersQuery.refetch();
  };

  useEffect(() => bindCasesChangedInvalidation(queryClient), [queryClient]);

  const selectMutation = useMutation({
    mutationFn: async () =>
      setActiveCaseIdFn({
        data: setActiveCaseIdInputSchema.parse({ caseId }),
      }),
    onSuccess: async () => {
      await invalidateAfterCaseSwitch(queryClient);
      notifyCasesChanged();
      toast.success("Active Case set");
    },
    onError: (err) => {
      toast.error(errMessage(err, "Failed to set Active Case"));
    },
  });

  if (headerLoadError) {
    return (
      <Page className="gap-4">
        <PageHeader />
        <FetchErrorAlert error={headerLoadError} onRetry={retryHeader} />
      </Page>
    );
  }

  if (headerPending) {
    return (
      <Page className="gap-4">
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
      <FetchErrorAlert error={listsLoadError} onRetry={retryLists} />
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
        listsPending={listsPending}
        listsPlaceholder={listsPlaceholder}
      />
    );
  }

  return (
    <Page className="gap-4">
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            {isActive ? (
              <DetailStatusChip size="sm" className="gap-0.5">
                <CheckIcon className="size-2.5" />
                Active
              </DetailStatusChip>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={selectMutation.isPending}
                onClick={() => {
                  selectMutation.mutate();
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
                a.href = `/api/v1/cases/${caseId}/export.zip`;
                a.click();
              }}
            >
              <DownloadIcon className="size-3.5" />
              Export
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => {
                setDeleteOpen(true);
              }}
            >
              Delete
            </Button>
          </div>
        }
      />

      {overviewBody}

      <DeleteCaseDialog
        caseRow={caseRow}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          toast.success("Case deleted");
          void navigate({ to: "/cases" });
        }}
      />
    </Page>
  );
}
