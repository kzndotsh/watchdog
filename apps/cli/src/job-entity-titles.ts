import {
  entityIdsFromJobInputs,
  entityTitleMapForJobInputs,
} from "@watchdog/schemas/jobs";
import type { CaseId } from "@watchdog/schemas/shared";

import { api } from "./client";
import { getManyChunked } from "./paging";

/** Labels of the Entities the Jobs' inputs name, read by id. */
export async function entityTitlesForJobs(
  caseId: CaseId,
  jobs: readonly { input: Record<string, unknown> | null | undefined }[]
): Promise<Map<string, string>> {
  const inputs = jobs.map((row) => row.input);
  const ids = entityIdsFromJobInputs(inputs);
  if (ids.length === 0) return new Map();
  const entities = await getManyChunked(ids, async (chunk) =>
    api().entities.getMany({ caseId, ids: chunk })
  );
  return entityTitleMapForJobInputs(entities, inputs);
}
