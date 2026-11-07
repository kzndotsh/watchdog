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
 * `updateCaseEffect` plus the disk Export's follow-up: a slug change best-effort renames the
 * Case's directory, then schedules a rewrite. The API calls this; the Case update alone lives in
 * `cases/` (which sits below the Export).
 */
export function updateCaseAndSyncExportEffect(
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
