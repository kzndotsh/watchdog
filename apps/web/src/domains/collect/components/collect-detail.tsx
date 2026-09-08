import type { CollectRow } from "@/domains/collect/types";
import { EvidenceDetail } from "@/domains/intake/components/evidence-detail";
import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import { JobDetail } from "@/domains/jobs/components/job-detail";
import type { JobListRecord, JobRecord } from "@/domains/jobs/types";
import { DetailEmpty } from "@/shared/ui/detail-empty";
import type { EntityOption } from "@/shared/ui/entity-combobox";

export interface CollectDetailProps {
  row: CollectRow | null;
  job: JobRecord | null;
  caseId: string;
  jobs: readonly JobListRecord[];
  entities: EntityOption[];
  entityNameById: ReadonlyMap<string, string>;
  allowThirdPartyEgress: boolean;
  evidenceActions: IntakeEvidenceActions;
  evidenceTitleById: ReadonlyMap<string, string>;
  entityTitleById: ReadonlyMap<string, string>;
  runSiblings: readonly JobListRecord[];
  recipeTotal?: number;
  busy: boolean;
  onCancel: () => void;
  onCancelPlaybook?: () => void;
  cancelPlaybookBusy?: boolean;
}

export function CollectDetail({
  row,
  job,
  caseId,
  jobs,
  entities,
  entityNameById,
  allowThirdPartyEgress,
  evidenceActions,
  evidenceTitleById,
  entityTitleById,
  runSiblings,
  recipeTotal,
  busy,
  onCancel,
  onCancelPlaybook,
  cancelPlaybookBusy,
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
        allowThirdPartyEgress={allowThirdPartyEgress}
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
      busy={busy}
      onCancel={onCancel}
      onCancelPlaybook={onCancelPlaybook}
      cancelPlaybookBusy={cancelPlaybookBusy}
    />
  );
}
