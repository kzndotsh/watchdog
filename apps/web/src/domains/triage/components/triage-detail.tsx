import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { mergeEvidenceRecords } from "@/domains/intake/lib/evidence";
import { evidenceListQuery } from "@/domains/intake/queries";
import type { EvidenceRecord } from "@/domains/intake/types";
import { TriageDecideHeader } from "@/domains/triage/components/triage-decide-header";
import { TriagePatchBody } from "@/domains/triage/components/triage-patch-body";
import { useTriageDetailForms } from "@/domains/triage/hooks/use-triage-detail-forms";
import type { ProposalRecord } from "@/domains/triage/triage.functions";
import type { AcceptFormValues } from "@/domains/triage/types";
import { errMessage } from "@/lib/utils";
import { listPending } from "@/shared/lib/list-pending";
import { queryEnabledFlag } from "@/shared/lib/query-enabled";
import { DetailEmpty } from "@/shared/ui/detail-empty";

interface TriageDetailProps {
  proposal: ProposalRecord | null;
  caseId: string;
  pending: boolean;
  error: string | null;
  onAccept: (values: AcceptFormValues) => void;
  onReject: (reason: string) => void;
}

/**
 * Triage Detail — context strip header + patch ledger + decide footer.
 */
export function TriageDetail({
  proposal,
  caseId,
  pending,
  error,
  onAccept,
  onReject,
}: TriageDetailProps) {
  const [previewEvidence, setPreviewEvidence] = useState<EvidenceRecord | null>(
    null
  );

  const { acceptForm, rejectForm, linkedIds, rejecting, setRejecting } =
    useTriageDetailForms(proposal, onAccept, onReject);

  const activeEvidenceQueryOptions = evidenceListQuery(caseId);
  const activeEvidenceQuery = useQuery({
    ...activeEvidenceQueryOptions,
    meta: { silentError: true },
  });
  const hiddenEvidenceQueryOptions = evidenceListQuery(caseId, {
    hiddenOnly: true,
  });
  const hiddenEvidenceQuery = useQuery({
    ...hiddenEvidenceQueryOptions,
    meta: { silentError: true },
  });
  const caseEvidence = useMemo(
    () =>
      mergeEvidenceRecords(activeEvidenceQuery.data, hiddenEvidenceQuery.data),
    [activeEvidenceQuery.data, hiddenEvidenceQuery.data]
  );
  const evidencePlaceholder =
    activeEvidenceQuery.isPlaceholderData ||
    hiddenEvidenceQuery.isPlaceholderData;
  const evidenceLoading =
    listPending(activeEvidenceQuery, {
      enabled: queryEnabledFlag(activeEvidenceQueryOptions.enabled),
    }) ||
    listPending(hiddenEvidenceQuery, {
      enabled: queryEnabledFlag(hiddenEvidenceQueryOptions.enabled),
    });
  const evidenceLoadError =
    !evidenceLoading &&
    !activeEvidenceQuery.isFetching &&
    !hiddenEvidenceQuery.isFetching &&
    (activeEvidenceQuery.isError || hiddenEvidenceQuery.isError)
      ? errMessage(
          activeEvidenceQuery.error ??
            hiddenEvidenceQuery.error ??
            new Error("Failed to load evidence"),
          "Failed to load evidence"
        )
      : null;

  const evidenceById = useMemo(() => {
    const map = new Map<string, EvidenceRecord>();
    for (const row of caseEvidence) map.set(row.id, row);
    return map;
  }, [caseEvidence]);

  const jobEvidence = useMemo(
    () =>
      linkedIds
        .map((id) => evidenceById.get(id))
        .filter((row): row is EvidenceRecord => Boolean(row)),
    [linkedIds, evidenceById]
  );
  const missingJobEvidenceCount =
    activeEvidenceQuery.isSuccess && hiddenEvidenceQuery.isSuccess
      ? linkedIds.length - jobEvidence.length
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
        caseEvidence={caseEvidence}
        missingJobEvidenceCount={missingJobEvidenceCount}
        evidenceLoading={evidenceLoading}
        evidencePlaceholder={evidencePlaceholder}
        evidenceById={evidenceById}
        evidenceLoadError={evidenceLoadError}
        onRetryEvidence={() => {
          if (activeEvidenceQuery.isError) void activeEvidenceQuery.refetch();
          if (hiddenEvidenceQuery.isError) void hiddenEvidenceQuery.refetch();
        }}
        pending={pending}
        error={error}
        rejecting={rejecting}
        onRejectingChange={setRejecting}
        previewEvidence={previewEvidence}
        onPreviewEvidenceChange={setPreviewEvidence}
      />
    </div>
  );
}
