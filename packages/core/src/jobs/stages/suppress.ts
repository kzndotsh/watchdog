import { Effect } from "effect";

import type { PatchOp } from "@watchdog/schemas";

import type { DomainTag } from "../../infra/tagged-errors";
import { suppressKnownFindingsEffect } from "../../proposals/finding-suppress";
import type { JobLog } from "./helpers";

export interface SuppressResult {
  kept: PatchOp[];
  suppressed: number;
}

/** Drop ops already on Graph / pending Proposal / rejected FP memory. */
export function suppressStageEffect(
  caseId: string,
  patch: PatchOp[],
  jobLog: JobLog
): Effect.Effect<SuppressResult, DomainTag> {
  if (patch.length === 0) {
    return Effect.succeed({ kept: [], suppressed: 0 });
  }
  return suppressKnownFindingsEffect(caseId, patch).pipe(
    Effect.tap(({ suppressed }) =>
      Effect.sync(() => {
        if (suppressed > 0) {
          jobLog.log(`suppressed ${suppressed} known/rejected finding(s)`);
        }
      })
    )
  );
}
