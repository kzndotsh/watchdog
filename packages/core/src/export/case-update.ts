import { Effect } from "effect";

import { updateCaseWithPreviousSlugEffect } from "../cases/cases";
import type { CaseRecord } from "../cases/cases";
import type { DomainTag } from "../errors/tagged-errors";
import type { Db } from "../infra/db-service";
import { logSwallowed } from "../infra/process-log";
import {
  renameCaseExportDirEffect,
  scheduleCaseExportEffect,
} from "./disk/export-sync";

/**
 * Update a Case (name, slug, description, egress), then the disk Export's follow-up: a slug
 * change best-effort renames the Case's directory, then schedules a rewrite. This is the one
 * Case update callers use; the row update alone (`updateCaseWithPreviousSlugEffect` in `cases/`,
 * which sits below the Export) never syncs the Export.
 */
export function updateCaseEffect(
  input: Parameters<typeof updateCaseWithPreviousSlugEffect>[0]
): Effect.Effect<CaseRecord, DomainTag, Db> {
  return Effect.gen(function* updateCaseAndSyncExportGen() {
    const { record, previousSlug } =
      yield* updateCaseWithPreviousSlugEffect(input);
    if (previousSlug !== undefined) {
      yield* renameCaseExportDirEffect(
        input.organizationId,
        previousSlug,
        record.slug
      ).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            logSwallowed("rename-case-export", error, {
              from: previousSlug,
              to: record.slug,
            });
          })
        )
      );
      yield* scheduleCaseExportEffect(record.id).pipe(
        Effect.forkDetach({ startImmediately: true })
      );
    }
    return record;
  });
}
