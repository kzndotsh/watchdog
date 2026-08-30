import { useQuery } from "@tanstack/react-query";

import { buildCollectIndex } from "@/domains/collect/lib/collect-index";
import { resolveCollectJobDetailId } from "@/domains/collect/lib/collect-job-detail";
import type { CollectRow } from "@/domains/collect/types";
import { EvidenceDetail } from "@/domains/intake/components/evidence-detail";
import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import type { EvidenceRecord } from "@/domains/intake/types";
import { JobDetail } from "@/domains/jobs/components/job-detail";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import { jobDetailQuery } from "@/domains/jobs/queries";
import { DetailEmpty } from "@/shared/ui/detail-empty";
import type { EntityOption } from "@/shared/ui/entity-combobox";

export interface CollectDetailProps {
  row: CollectRow | null;
  caseId: string;
  evidence: readonly EvidenceRecord[];
  jobs: readonly JobListRecord[];
  entities: EntityOption[];
  entityNameById: ReadonlyMap<string, string>;
  allowThirdPartyEgress: boolean;
  evidenceActions: IntakeEvidenceActions;
  focusRunId: string | null;
  recipeStepCountByPlaybookId?: ReadonlyMap<string, number>;
  busy: boolean;
  onCancel: () => void;
  onCancelPlaybook?: () => void;
  cancelPlaybookBusy?: boolean;
}

export function CollectDetail({
  row,
  caseId,
  evidence,
  jobs,
  entities,
  entityNameById,
  allowThirdPartyEgress,
  evidenceActions,
  focusRunId,
  recipeStepCountByPlaybookId,
  busy,
  onCancel,
  onCancelPlaybook,
  cancelPlaybookBusy,
}: CollectDetailProps) {
  const index = buildCollectIndex(evidence, jobs, {
    recipeStepsByPlaybookId: recipeStepCountByPlaybookId,
  });

  const runJobId = resolveCollectJobDetailId(row, focusRunId);

  const { data: runDetail } = useQuery({
    ...jobDetailQuery(caseId, runJobId ?? ""),
    enabled: runJobId !== null && row?.evidence === null,
  });

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
        allowThirdPartyEgress={allowThirdPartyEgress}
        actions={evidenceActions}
      />
    );
  }

  const runSiblings =
    row.playbookRunId === null
      ? []
      : jobs.filter((job) => job.playbookRunId === row.playbookRunId);
  const recipeTotal =
    row.playbookRunId === null
      ? undefined
      : recipeStepCountByPlaybookId?.get(row.runs[0]?.job.playbookId ?? "");

  return (
    <JobDetail
      job={runDetail?.id === runJobId ? runDetail : null}
      runSiblings={runSiblings}
      evidenceTitleById={
        new Map(
          evidence.map((item) => [
            item.id,
            index.titleForEvidence(item.id) ?? item.kind,
          ])
        )
      }
      recipeTotal={recipeTotal ?? row.recipe?.total}
      busy={busy}
      onCancel={onCancel}
      onCancelPlaybook={onCancelPlaybook}
      cancelPlaybookBusy={cancelPlaybookBusy}
    />
  );
}
