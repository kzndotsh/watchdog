import { useMemo, useState } from "react";

import { evidencePickerPort } from "@/domains/intake/queries";
import { TriageDecideHeader } from "@/domains/triage/components/triage-decide-header";
import { TriagePatchBody } from "@/domains/triage/components/triage-patch-body";
import { useTriageDetailForms } from "@/domains/triage/hooks/use-triage-detail-forms";
import type { AcceptFormValues } from "@/domains/triage/types";
import { useRecordsByIdsState } from "@/shared/hooks/use-picker-source";
import { DetailEmpty } from "@/shared/ui/detail-empty";
import type { ProposalRecord } from "@watchdog/core/proposals";

type TriageDetailProps = {
  proposal: ProposalRecord | null;
  caseId: string;
  isPending: boolean;
  error: string | null;
  onAccept: (values: AcceptFormValues) => void;
  onReject: (reason: string) => void;
};

/**
 * Triage Detail: context strip header + patch ledger + decide footer. It never reads the Case's
 * Evidence list: the cited Evidence is titled by a by-ids read, and the Accept picker searches
 * on the server (#580).
 */
export function TriageDetail({
  proposal,
  caseId,
  isPending,
  error,
  onAccept,
  onReject,
}: TriageDetailProps) {
  const [previewEvidenceId, setPreviewEvidenceId] = useState<string | null>(
    null
  );

  const { acceptForm, rejectForm, linkedIds, isRejecting, setRejecting } =
    useTriageDetailForms(proposal, onAccept, onReject);

  const evidencePort = useMemo(() => evidencePickerPort(caseId), [caseId]);
  const cited = useRecordsByIdsState(evidencePort, linkedIds);
  const isEvidenceLoading = cited.status === "pending";
  const evidenceLoadError =
    cited.status === "error" ? "Failed to load evidence" : null;
  const handleRetryEvidence = cited.retry;
  // Ids the Case does not hold (or another Case's): counted once every read has answered.
  const missingJobEvidenceCount =
    cited.status === "ready"
      ? linkedIds.filter((id) => !cited.byId.has(id)).length
      : 0;

  if (!proposal) {
    return (
      <DetailEmpty
        title="Select a proposal"
        description="Choose a row from the queue to review the patch."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TriageDecideHeader proposal={proposal} linkedIds={linkedIds} />

      <TriagePatchBody
        proposal={proposal}
        caseId={caseId}
        acceptForm={acceptForm}
        rejectForm={rejectForm}
        linkedIds={linkedIds}
        evidencePort={evidencePort}
        missingJobEvidenceCount={missingJobEvidenceCount}
        isEvidenceLoading={isEvidenceLoading}
        evidenceById={cited.byId}
        evidenceLoadError={evidenceLoadError}
        onRetryEvidence={handleRetryEvidence}
        isPending={isPending}
        error={error}
        isRejecting={isRejecting}
        onRejectingChange={setRejecting}
        previewEvidenceId={previewEvidenceId}
        onPreviewEvidenceChange={setPreviewEvidenceId}
      />
    </div>
  );
}
