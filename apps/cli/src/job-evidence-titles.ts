import { listEvidenceInputSchema } from "@watchdog/schemas/evidence";
import {
  evidenceIdsFromJobInputs,
  evidenceTitleMapForJobInputs,
} from "@watchdog/schemas/jobs";
import type { CaseId } from "@watchdog/schemas/shared";

import { api } from "./client";
import { entityTitlesForJobs } from "./job-entity-titles";

async function listEvidenceForTitles(caseId: CaseId, hiddenOnly: boolean) {
  return api().evidence.list(
    listEvidenceInputSchema.parse({
      caseId,
      unprocessedOnly: false,
      unattachedOnly: false,
      hiddenOnly,
    })
  );
}

export async function evidenceTitlesForJobs(
  caseId: CaseId,
  jobs: readonly { input: Record<string, unknown> | null | undefined }[]
): Promise<Map<string, string>> {
  const inputs = jobs.map((row) => row.input);
  const ids = evidenceIdsFromJobInputs(inputs);
  if (ids.length === 0) return new Map();
  const needed = new Set(ids);

  const active = await listEvidenceForTitles(caseId, false);
  const titles = evidenceTitleMapForJobInputs(active, inputs);
  const missing = [...needed].filter((id) => !titles.has(id));
  if (missing.length === 0) return titles;

  const hidden = await listEvidenceForTitles(caseId, true);
  for (const [id, title] of evidenceTitleMapForJobInputs(hidden, inputs)) {
    if (!titles.has(id)) titles.set(id, title);
  }
  return titles;
}

export async function jobInputTitlesForJobs(
  caseId: CaseId,
  jobs: readonly { input: Record<string, unknown> | null | undefined }[]
): Promise<{
  evidenceTitles: Map<string, string>;
  entityTitles: Map<string, string>;
}> {
  const [evidenceTitles, entityTitles] = await Promise.all([
    evidenceTitlesForJobs(caseId, jobs),
    entityTitlesForJobs(caseId, jobs),
  ]);
  return { evidenceTitles, entityTitles };
}
