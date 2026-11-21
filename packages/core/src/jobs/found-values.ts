import { Effect } from "effect";

import { CAPABILITIES } from "@watchdog/caps";
import type { IdentifierHolderRow } from "@watchdog/db";
import {
  FOUND_VALUE_ENTITIES_MAX,
  FOUND_VALUES_MAX,
  type FoundValue,
  type FoundValueRecord,
  type JobFoundValues,
} from "@watchdog/schemas/jobs";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

import { assertCaseInOrgEffect, requireTrimmedGraphId } from "../cases/access";
import { NotFoundError, type DomainTag } from "../errors/tagged-errors";
import { readArtifactBytesEffect } from "../infra/blob";
import type { BlobStore } from "../infra/blob-store";
import type { Db } from "../infra/db-service";
import { inOrganization } from "../infra/organization-scope";
import { identifiersRepoFxDb, jobsRepoFxDb } from "../infra/repos-fx";
import { loadCapReportEffect } from "./load-cap-report";

const NO_READER: JobFoundValues = {
  hasReader: false,
  values: [],
  total: 0,
  isTruncated: false,
};

function keyOf(value: {
  type: string;
  platform?: string;
  value: string;
}): string {
  return `${value.type}\u0000${value.platform ?? ""}\u0000${value.value}`;
}

/**
 * A reader's values as the Found tab lists them: one row per distinct value (type, platform,
 * value) in report order, with every source it appeared under and the Entities that already hold
 * it. At most `max` rows; `total` counts them all.
 */
export function mergeFoundValues(
  found: readonly FoundValue[],
  holders: readonly IdentifierHolderRow[],
  max: number = FOUND_VALUES_MAX
): JobFoundValues {
  const byKey = new Map<string, FoundValueRecord>();
  for (const item of found) {
    const key = keyOf(item);
    const row = byKey.get(key);
    if (row === undefined) {
      byKey.set(key, {
        type: item.type,
        platform: item.platform ?? "",
        value: item.value,
        sources: [item.source],
        onEntities: [],
      });
    } else if (!row.sources.includes(item.source)) {
      row.sources.push(item.source);
    }
  }
  for (const holder of holders) {
    const row = byKey.get(keyOf(holder));
    if (row === undefined || row.onEntities.length >= FOUND_VALUE_ENTITIES_MAX)
      continue;
    if (row.onEntities.some((entity) => entity.id === holder.entityId))
      continue;
    row.onEntities.push({
      id: holder.entityId,
      name: holder.entityName,
      slug: holder.entitySlug,
    });
  }
  const rows = [...byKey.values()];
  return {
    hasReader: true,
    values: rows.slice(0, max),
    total: rows.length,
    isTruncated: rows.length > max,
  };
}

/**
 * Every typed value a Job's report holds, read on demand through its Cap's `found` reader (so a
 * reader added later also covers Jobs that already ran), with the Entities of the Case that
 * already hold each one. A Job of another Case or organization is `NotFoundError`; a Cap with no
 * reader, or a Job with no report yet, is `hasReader: false`.
 */
export function listJobFoundValuesEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  jobId: string
): Effect.Effect<JobFoundValues, DomainTag, Db | BlobStore> {
  const program = Effect.gen(function* listJobFoundValuesGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedJobId = yield* requireTrimmedGraphId(jobId, "Job");
    const row = yield* jobsRepoFxDb.getInCase(scopedCaseId, normalizedJobId);
    if (!row) {
      return yield* new NotFoundError({ entity: "Job", id: normalizedJobId });
    }
    const reader = CAPABILITIES.find(
      (cap) => cap.id === row.job.capabilityId
    )?.found;
    if (reader === undefined) return NO_READER;
    const loaded = yield* loadCapReportEffect(row.job.output ?? [], (uri) =>
      readArtifactBytesEffect(uri)
    );
    if (loaded === null) return NO_READER;
    const found = reader(loaded.report);
    if (found === undefined) return NO_READER;
    const values = [...new Set(found.map((item) => item.value))];
    const holders = yield* identifiersRepoFxDb.listHoldersByValues(
      scopedCaseId,
      values
    );
    return mergeFoundValues(found, holders);
  });
  return inOrganization(organizationId, program);
}
