import type { CollectRow } from "@/domains/collect/types";
import { EvidenceDetail } from "@/domains/intake/components/evidence-detail";
import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import { JobDetail } from "@/domains/jobs/components/job-detail";
import type { CapProviderInfo } from "@/domains/jobs/types";
import { DetailEmpty } from "@/shared/ui/detail-empty";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import type { JobListRecord, JobRecord } from "@watchdog/core/jobs";
import type { PlaybookRunView } from "@watchdog/schemas/jobs";
import type { EgressClass } from "@watchdog/schemas/shared";

export type CollectDetailProps = {
  row: CollectRow | null;
  job: JobRecord | null;
  caseId: string;
  jobs: readonly JobListRecord[];
  entities: EntityOption[];
  entityNameById: ReadonlyMap<string, string>;
  allowedEgress: readonly EgressClass[];
  evidenceActions: IntakeEvidenceActions;
  evidenceTitleById: ReadonlyMap<string, string>;
  entityTitleById: ReadonlyMap<string, string>;
  runSiblings: readonly JobListRecord[];
  recipeTotal?: number;
  playbookRun?: PlaybookRunView | null;
  onSelectStep?: (jobId: string) => void;
  isBusy: boolean;
  onCancel: () => void;
  onCancelPlaybook?: () => void;
  isCancelPlaybookBusy?: boolean;
  attempts?: JobListRecord[];
  onSelectAttempt?: (jobId: string) => void;
  onRetry?: () => void;
  isRetryBusy?: boolean;
  onEditAndRerun?: () => void;
  /** The credit the selected Job's Cap provider asks for. */
  attribution?: CapProviderInfo["attribution"] | null;
};

export function CollectDetail({
  row,
  job,
  caseId,
  jobs,
  entities,
  entityNameById,
  allowedEgress,
  evidenceActions,
  evidenceTitleById,
  entityTitleById,
  runSiblings,
  recipeTotal,
  playbookRun,
  onSelectStep,
  isBusy,
  onCancel,
  onCancelPlaybook,
  isCancelPlaybookBusy,
  attempts,
  onSelectAttempt,
  onRetry,
  isRetryBusy,
  onEditAndRerun,
  attribution,
}: CollectDetailProps) {
  if (row === null) {
    return (
      <DetailEmpty
        title="Select an item"
        description="Pick a row from the queue to inspect dumps, runs, and lineage."
      />
    );
  }

  if (row.evidence !== null) {
    const entityName =
      row.evidence.entityId !== null && row.evidence.entityId !== ""
        ? (entityNameById.get(row.evidence.entityId) ?? null)
        : null;
    return (
      <EvidenceDetail
        key={row.evidence.id}
        evidence={row.evidence}
        caseId={caseId}
        jobs={[...jobs]}
        entities={entities}
        entityName={entityName}
        allowedEgress={allowedEgress}
        actions={evidenceActions}
      />
    );
  }

  return (
    <JobDetail
      job={job}
      runSiblings={[...runSiblings]}
      evidenceTitleById={evidenceTitleById}
      entityTitleById={entityTitleById}
      recipeTotal={recipeTotal}
      playbookRun={playbookRun}
      onSelectStep={onSelectStep}
      isBusy={isBusy}
      onCancel={onCancel}
      onCancelPlaybook={onCancelPlaybook}
      isCancelPlaybookBusy={isCancelPlaybookBusy}
      attempts={attempts}
      onSelectAttempt={onSelectAttempt}
      onRetry={onRetry}
      isRetryBusy={isRetryBusy}
      onEditAndRerun={onEditAndRerun}
      attribution={attribution}
    />
  );
}
