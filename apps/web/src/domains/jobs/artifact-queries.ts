import { queryOptions } from "@tanstack/react-query";

import { getArtifactContentFn } from "@/domains/jobs/jobs-artifact.functions";
import { jobsKeys } from "@/domains/jobs/jobs-keys";
import {
  getArtifactContentInputSchema,
  type GetArtifactContentInput,
} from "@/domains/jobs/types";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

function artifactContentQueryKey(input: GetArtifactContentInput) {
  const scoped = getArtifactContentInputSchema.safeParse(input);
  if (scoped.success && scoped.data.source === "job") {
    return jobsKeys.jobArtifact(
      scoped.data.caseId,
      scoped.data.jobId,
      scoped.data.sha256,
      scoped.data.mime
    );
  }
  if (scoped.success && scoped.data.source === "evidence") {
    return jobsKeys.evidenceArtifact(
      scoped.data.caseId,
      scoped.data.evidenceId,
      scoped.data.mime
    );
  }
  if (input.source === "job") {
    return jobsKeys.jobArtifact(
      input.caseId,
      input.jobId,
      input.sha256,
      input.mime
    );
  }
  return jobsKeys.evidenceArtifact(input.caseId, input.evidenceId, input.mime);
}

export function artifactContentQuery(input: GetArtifactContentInput) {
  const scoped = getArtifactContentInputSchema.safeParse(input);
  const queryKey = artifactContentQueryKey(input);

  return queryOptions({
    queryKey,
    queryFn: async () =>
      getArtifactContentFn({
        data: getArtifactContentInputSchema.parse(input),
      }),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    enabled: scoped.success,
    placeholderData: placeholderDataForQueryKey(queryKey),
    meta: { silentError: true },
  });
}
