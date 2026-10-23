import { JobExportDownload } from "@/domains/jobs/components/job-export-download";
import { JobProposalLink } from "@/domains/jobs/components/job-proposal-link";
import type { JobDetailView } from "@/domains/jobs/lib/job-detail-view";
import { DetailFooter } from "@/shared/ui/detail-footer";
import { Button } from "@/shared/ui/primitives/button";

type JobDetailFooterBarProps = {
  view: JobDetailView;
  isBusy: boolean;
  isCancelPlaybookBusy?: boolean;
  onCancel: () => void;
  onCancelPlaybook?: () => void;
  isRetryBusy?: boolean;
  onRetry?: () => void;
  onEditAndRerun?: () => void;
};

export function JobDetailFooterBar({
  view,
  isBusy: busy,
  isCancelPlaybookBusy: cancelPlaybookBusy,
  onCancel,
  onCancelPlaybook,
  isRetryBusy: retryBusy,
  onRetry,
  onEditAndRerun,
}: JobDetailFooterBarProps) {
  if (!view.shouldShowFooter) return null;
  return (
    <DetailFooter>
      {view.canCancel ? (
        <Button
          type="button"
          variant="outline"
          loading={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      ) : null}
      {view.canRetry && onEditAndRerun !== undefined ? (
        <Button type="button" variant="outline" onClick={onEditAndRerun}>
          Edit and re-run
        </Button>
      ) : null}
      {view.canRetry && onRetry !== undefined ? (
        <Button
          type="button"
          variant="outline"
          loading={retryBusy}
          onClick={onRetry}
        >
          Retry
        </Button>
      ) : null}
      {view.canCancelPlaybook ? (
        <Button
          type="button"
          variant="outline"
          loading={cancelPlaybookBusy}
          onClick={onCancelPlaybook}
        >
          Cancel run
        </Button>
      ) : null}
      {view.exportDownloadPath === null ? null : (
        <JobExportDownload path={view.exportDownloadPath} />
      )}
      {view.proposalId === null ? null : (
        <JobProposalLink proposalId={view.proposalId} />
      )}
    </DetailFooter>
  );
}
