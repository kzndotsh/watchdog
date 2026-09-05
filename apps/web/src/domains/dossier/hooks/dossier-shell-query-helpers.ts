import type { EvidenceRecord } from "@/domains/intake/types";

export interface DossierTabCounts {
  claims: number;
  identifiers: number;
  connections: number;
  evidence: number;
  events: number;
  questions: number;
  tasks: number;
}

const EMPTY_ROWS: never[] = [];

export function dataOrEmpty<T>(data: readonly T[] | undefined): readonly T[] {
  if (data === undefined) return EMPTY_ROWS;
  return data;
}

export function anyQueryPending(flags: readonly boolean[]): boolean {
  for (const flag of flags) {
    if (flag) return true;
  }
  return false;
}

export function evidenceRecordMap(
  evidenceAll: readonly EvidenceRecord[]
): Map<string, EvidenceRecord> {
  return new Map(evidenceAll.map((entry) => [entry.id, entry]));
}

export function dossierTabCounts(
  claimsRaw: readonly { retracted: boolean }[],
  identifiers: readonly unknown[],
  edges: readonly unknown[],
  events: readonly unknown[],
  questions: readonly { status: string }[],
  evidenceAll: readonly { entityId: string | null }[],
  entityId: string,
  entityTasks: readonly { status: string }[]
): DossierTabCounts {
  return {
    claims: claimsRaw.filter((claim) => !claim.retracted).length,
    identifiers: identifiers.length,
    connections: edges.length,
    events: events.length,
    questions: questions.filter((question) => question.status === "open")
      .length,
    evidence: evidenceAll.filter((entry) => entry.entityId === entityId).length,
    tasks: entityTasks.filter(
      (task) => task.status !== "done" && task.status !== "dropped"
    ).length,
  };
}

export function openEvidencePreview(
  evidenceMap: Map<string, EvidenceRecord>,
  evId: string,
  setPreviewEvidence: (evidence: EvidenceRecord | null) => void
): void {
  const evidence = evidenceMap.get(evId);
  if (evidence === undefined) return;
  setPreviewEvidence(evidence);
}
