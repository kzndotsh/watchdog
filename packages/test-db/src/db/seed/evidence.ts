import {
  activityLogRepo,
  evidenceRepo,
  type DbExec,
  type EvidenceRow,
  type NewEvidence,
} from "@watchdog/db";
import { evidenceDisplayLabel } from "@watchdog/schemas/evidence";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ACTOR_ID } from "@watchdog/test-kit/fixtures";

const DEFAULT_EVIDENCE: Omit<NewEvidence, "caseId"> = {
  entityId: null,
  kind: "attestation",
  label: "test evidence",
  notes: null,
  mime: "text/plain",
  uri: null,
  sha256: null,
  text: "attestation body",
  sourceUrl: null,
  actorId: TEST_ACTOR_ID,
};

export async function seedEvidence(
  exec: DbExec,
  caseId: CaseId,
  overrides?: Partial<NewEvidence>
): Promise<EvidenceRow> {
  const created = await evidenceRepo.create(exec, {
    ...DEFAULT_EVIDENCE,
    caseId,
    ...overrides,
  });
  if (!created) {
    throw new Error("seedEvidence failed");
  }
  // The entry the write path appends, so a seeded row shows in Recent activity.
  const entry = await activityLogRepo.append(exec, {
    caseId,
    kind: "evidence",
    action: "captured",
    subjectId: created.id,
    label: evidenceDisplayLabel(created),
    actorId: created.actorId,
    actorLabel: created.actorLabel,
  });
  if (!entry) {
    throw new Error("seedEvidence activity failed");
  }
  return created;
}
