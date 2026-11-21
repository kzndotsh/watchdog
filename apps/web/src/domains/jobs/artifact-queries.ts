import { queryOptions } from "@tanstack/react-query";

import { artifactKeys } from "@/domains/jobs/jobs-keys";
import {
  getArtifactContentInputSchema,
  type GetArtifactContentInput,
} from "@/domains/jobs/types";
import { orpc } from "@/lib/orpc-client";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { isTextMime } from "@watchdog/schemas/shared";

function artifactContentQueryKey(input: GetArtifactContentInput) {
  const scoped = getArtifactContentInputSchema.safeParse(input);
  const key = scoped.success ? scoped.data : input;
  return key.source === "job"
    ? artifactKeys.job(key.caseId, key.jobId, key.sha256, key.mime)
    : artifactKeys.evidence(key.caseId, key.evidenceId, key.mime);
}

/** A Job artifact's text (`jobs.artifactText`; a binary mime asks nothing) or an Evidence body's (`evidence.text`). */
async function fetchArtifactContent(
  input: GetArtifactContentInput
): Promise<{ text: string | null }> {
  const scoped = getArtifactContentInputSchema.parse(input);
  if (scoped.source === "evidence") {
    // Evidence callers gate on `evidenceNeedsBlobText` (attestation + text mimes).
    return orpc.evidence.text.call({
      caseId: scoped.caseId,
      evidenceId: scoped.evidenceId,
    });
  }
  if (!isTextMime(scoped.mime)) return { text: null };
  return orpc.jobs.artifactText.call({
    caseId: scoped.caseId,
    jobId: scoped.jobId,
    sha256: scoped.sha256,
  });
}

/**
 * An artifact body for the Job Detail and the Collect Evidence preview. Keyed under its own root
 * (`artifactKeys`), not the procedure keys, so no Job or Evidence invalidation re-downloads it.
 */
export function artifactContentQuery(input: GetArtifactContentInput) {
  const scoped = getArtifactContentInputSchema.safeParse(input);
  const queryKey = artifactContentQueryKey(input);

  return queryOptions({
    queryKey,
    queryFn: async () => fetchArtifactContent(input),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    enabled: scoped.success,
    placeholderData: placeholderDataForQueryKey(queryKey),
    meta: { silentError: true },
  });
}
