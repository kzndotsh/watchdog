import {
  evidenceIdsFromJobInputs,
  evidenceTitleMapForJobInputs,
} from "@watchdog/schemas/jobs";
import type { CaseId } from "@watchdog/schemas/shared";

import { api } from "./client";
import { entityTitlesForJobs } from "./job-entity-titles";

/** Titles of the Evidence the Jobs' inputs name, read by id (hidden Evidence too). */
export async function evidenceTitlesForJobs(
  caseId: CaseId,
  jobs: readonly { input: Record<string, unknown> | null | undefined }[]
): Promise<Map<string, string>> {
  const inputs = jobs.map((row) => row.input);
  const ids = evidenceIdsFromJobInputs(inputs);
  if (ids.length === 0) return new Map();
  const rows = await api().evidence.getMany({ caseId, ids });
  return evidenceTitleMapForJobInputs(rows, inputs);
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
