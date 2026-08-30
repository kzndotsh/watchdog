import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQueries,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckIcon, DownloadIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { setActiveCaseIdFn } from "@/domains/cases/cases.functions";
import {
  CaseOverviewSuspense,
  CaseOverviewPending,
} from "@/domains/cases/components/case-overview-pending";
import { CaseOverviewTab } from "@/domains/cases/components/case-overview-tab";
import { DeleteCaseDialog } from "@/domains/cases/components/delete-case-dialog";
import { notifyCasesChanged } from "@/domains/cases/lib/active-case";
import { caseByIdQuery, casesContextQuery } from "@/domains/cases/queries";
import { identifiersForCaseQuery } from "@/domains/entities/identifiers/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { errMessage } from "@/lib/utils";
import { Page, PageHeader } from "@/shared/layout/page";
import {
  bindCasesChangedInvalidation,
  invalidateAfterCaseSwitch,
} from "@/shared/lib/query-invalidation";
import { DetailStatusChip } from "@/shared/ui/detail-status-chip";
import { Button } from "@/shared/ui/shadcn/button";

export function CaseOverview({ caseId }: { caseId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [{ data: caseRow }, { data: casesCtx }] = useSuspenseQueries({
    queries: [caseByIdQuery(caseId), casesContextQuery()],
  });

  const { data: entities = [], isPending: entitiesPending } = useQuery(
    entitiesListQuery(caseId)
  );
  const { data: identifiers = [], isPending: identifiersPending } = useQuery(
    identifiersForCaseQuery(caseId)
  );

  useEffect(() => bindCasesChangedInvalidation(queryClient), [queryClient]);

  const selectMutation = useMutation({
    mutationFn: async () => setActiveCaseIdFn({ data: { caseId } }),
    onSuccess: async () => {
      await invalidateAfterCaseSwitch(queryClient);
      notifyCasesChanged();
      toast.success("Active Case set");
    },
    onError: (err) => {
      toast.error(errMessage(err, "Failed to set Active Case"));
    },
  });

  if (!caseRow) {
    return null;
  }

  const isActive = casesCtx.active?.id === caseId;
  const listsPending = entitiesPending || identifiersPending;

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

      {listsPending ? (
        <CaseOverviewPending />
      ) : (
        <CaseOverviewSuspense>
          <CaseOverviewTab
            caseId={caseId}
            caseRow={caseRow}
            entities={entities}
            identifiers={identifiers}
            listsPending={listsPending}
          />
        </CaseOverviewSuspense>
      )}

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
