import { Effect } from "effect";

import { isTextMime } from "@watchdog/schemas/shared";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

import type { DomainTag } from "../errors/tagged-errors";
import { artifactTextOf } from "../infra/artifact-text";
import { readArtifactBytesEffect } from "../infra/blob";
import { isKeyInCase, type BlobStore } from "../infra/blob-store";
import type { Db } from "../infra/db-service";
import { inOrganization } from "../infra/organization-scope";
import { getJobForCaseEffect } from "./start-job";

/**
 * The text of one of a Job's output artifacts (by its sha256), for the Job Detail's preview:
 * null when the Job has no such artifact, its type is not text (`isTextMime` on the artifact's
 * own mime), or its stored key is outside the Case (`isKeyInCase`). The Job is read in the caller's
 * organization, so a foreign or missing Job or Case is `NotFoundError`. Cut at
 * `ARTIFACT_TEXT_MAX_CHARS`.
 */
export function readJobArtifactTextEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  jobId: string,
  sha256: string
): Effect.Effect<{ text: string | null }, DomainTag, Db | BlobStore> {
  return inOrganization(
    organizationId,
    Effect.gen(function* readJobArtifactTextGen() {
      const job = yield* getJobForCaseEffect(caseId, organizationId, jobId);
      const artifact = job.output?.find((row) => row.sha256 === sha256);
      if (
        artifact === undefined ||
        !isTextMime(artifact.mime) ||
        !isKeyInCase(artifact.uri, job.caseId)
      ) {
        return { text: null };
      }
      const bytes = yield* readArtifactBytesEffect(artifact.uri);
      return { text: artifactTextOf(bytes) };
    })
  );
}
