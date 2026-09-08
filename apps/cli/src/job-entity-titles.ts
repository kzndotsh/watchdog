import {
  caseScopeInputSchema,
  entityIdsFromJobInputs,
  entityTitleMapForJobInputs,
} from "@watchdog/schemas";

import { api } from "./client";

export async function entityTitlesForJobs(
  caseId: string,
  jobs: readonly { input: Record<string, unknown> | null | undefined }[]
): Promise<Map<string, string>> {
  const inputs = jobs.map((row) => row.input);
  if (entityIdsFromJobInputs(inputs).length === 0) return new Map();
  const entities = await api().entities.list(
    caseScopeInputSchema.parse({ caseId })
  );
  return entityTitleMapForJobInputs(entities, inputs);
}
