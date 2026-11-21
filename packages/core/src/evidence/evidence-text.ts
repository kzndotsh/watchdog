import { Effect } from "effect";

import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

import { assertCaseInOrgEffect, requireTrimmedGraphId } from "../cases/access";
import type { DomainTag } from "../errors/tagged-errors";
import { artifactTextOf } from "../infra/artifact-text";
import { readArtifactBytesEffect } from "../infra/blob";
import type { BlobStore } from "../infra/blob-store";
import type { Db } from "../infra/db-service";
import { evidenceRepoFxDb } from "../infra/repos-fx";

/**
 * The stored body of one Evidence item (hidden or not) as preview text, read from object storage
 * by its stored uri: null when the item has no stored blob or is not in the Case. The Case is
 * checked against the caller's organization first. Cut at `ARTIFACT_TEXT_MAX_CHARS`. The caller
 * decides which items are text (the web reads only attestations and text mimes).
 */
export function readEvidenceTextEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  evidenceId: string
): Effect.Effect<{ text: string | null }, DomainTag, Db | BlobStore> {
  return Effect.gen(function* readEvidenceTextGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEvidenceId = yield* requireTrimmedGraphId(
      evidenceId,
      "Evidence"
    );
    const row = yield* evidenceRepoFxDb.getUriInCaseIncludingDeleted(
      scopedCaseId,
      normalizedEvidenceId
    );
    const uri = row?.uri;
    if (uri === undefined || uri === null || uri === "") {
      return { text: null };
    }
    const bytes = yield* readArtifactBytesEffect(uri);
    return { text: artifactTextOf(bytes) };
  });
}
