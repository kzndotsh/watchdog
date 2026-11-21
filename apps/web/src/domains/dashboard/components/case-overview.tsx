import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { DeleteCaseDialog } from "@/domains/cases/components/delete-case-dialog";
import { useCaseDeletedToast } from "@/domains/cases/hooks/use-case-deleted-toast";
import { useUpdateCase } from "@/domains/cases/hooks/use-update-case";
import { exportCaseZip } from "@/domains/cases/lib/export-case-zip";
import { caseByIdQuery, deletionPolicyQuery } from "@/domains/cases/queries";
import { CaseOverviewPending } from "@/domains/dashboard/components/case-overview-pending";
import { CaseOverviewTab } from "@/domains/dashboard/components/case-overview-tab";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { listPending } from "@/shared/lib/list-pending";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";
import { EditableTextCell } from "@/shared/ui/data-table";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/with-tooltip";

export function CaseOverview({ caseId }: { caseId: string }) {
  const navigate = useNavigate();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const showDeletedToast = useCaseDeletedToast();

  const [caseQuery, policyQuery] = useQueries({
    queries: [caseByIdQuery(caseId), deletionPolicyQuery()] as const,
  });
  const caseRow = caseQuery.data;
  // Delete is for owners and admins; the server enforces it too.
  const policy = policyQuery.data;
  const canDelete = policy?.canManage === true;
  const headerPending = listPending(caseQuery);
  const headerLoadError = combinedQueryLoadError(
    [caseQuery],
    headerPending,
    "Failed to load case"
  );
  const handleRetryHeader = () => {
    if (caseQuery.isError) void caseQuery.refetch();
  };

  const renameMutation = useUpdateCase(caseId, caseRow?.slug);
  /** Bumped when a rename fails so the editor drops its unsaved draft. */
  const [nameEditorKey, setNameEditorKey] = useState(0);

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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void exportCaseZip(caseId);
              }}
            >
              <DownloadIcon className="size-3.5" />
              Export
            </Button>
            {canDelete ? (
              <WithTooltip
                content="Also include the raw provider responses each provider's terms allow. Owners and admins only."
                shouldWrapSpan
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void exportCaseZip(caseId, {
                      shouldIncludeRawBodies: true,
                    });
                  }}
                >
                  <DownloadIcon className="size-3.5" />
                  Export with responses
                </Button>
              </WithTooltip>
            ) : null}
            {policy?.canIncludeBreachCredentials === true ? (
              <WithTooltip
                content="Keep the recovered passwords and hashes in breach Evidence. Without this they are cut to whether one was present, its kind, its length and a reuse fingerprint. Owners and admins only."
                shouldWrapSpan
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void exportCaseZip(caseId, {
                      shouldIncludeBreachCredentials: true,
                    });
                  }}
                >
                  <DownloadIcon className="size-3.5" />
                  Include breach credentials
                </Button>
              </WithTooltip>
            ) : null}
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

      <CaseOverviewTab caseId={caseId} caseRow={caseRow} />

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
