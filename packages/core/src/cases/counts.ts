import { Effect } from "effect";

import {
  LIST_TOTAL_CAP,
  type CaseId,
  type ListTotal,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import { assertCaseInOrgEffect } from "../graph/patch/guards";
import { nowDateEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { caseCountsRepoFxDb } from "../infra/repos-fx";
import type { DomainTag } from "../infra/tagged-errors";

/** A Case's tile counts, each exact below `LIST_TOTAL_CAP` and capped at it above (#571). */
export type CaseCounts = {
  readonly entities: ListTotal;
  readonly identifiers: ListTotal;
  readonly connections: ListTotal;
  readonly evidence: ListTotal;
  readonly liveJobs: ListTotal;
  readonly tasksOverdue: ListTotal;
  readonly tasksDueSoon: ListTotal;
};

/** A task is "due soon" through this many calendar days after today. */
export const TASK_DUE_SOON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function totalOf(count: number): ListTotal {
  return count > LIST_TOTAL_CAP
    ? { count: LIST_TOTAL_CAP, isCapped: true }
    : { count, isCapped: false };
}

/** The server's UTC midnight, the day start when the caller sends none. */
function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

/**
 * The Case's tile counts in one read (#571): the Overview and Dashboard tiles ask for these, never
 * for a whole list. Each count scans at most `LIST_TOTAL_CAP + 1` rows, like a list's `total`.
 * `dayStart` is the start of the caller's calendar day (their time zone decides "overdue").
 */
export function getCaseCountsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  opts: { readonly dayStart?: Date } = {}
): Effect.Effect<CaseCounts, DomainTag, Db> {
  return Effect.gen(function* getCaseCountsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const dayStart = opts.dayStart ?? utcDayStart(yield* nowDateEffect);
    const row = yield* caseCountsRepoFxDb.countCapped(
      scopedCaseId,
      LIST_TOTAL_CAP,
      {
        dayStart,
        soonEnd: new Date(
          dayStart.getTime() + (TASK_DUE_SOON_DAYS + 1) * DAY_MS
        ),
      }
    );
    return {
      entities: totalOf(row.entities),
      identifiers: totalOf(row.identifiers),
      connections: totalOf(row.connections),
      evidence: totalOf(row.evidence),
      liveJobs: totalOf(row.liveJobs),
      tasksOverdue: totalOf(row.tasksOverdue),
      tasksDueSoon: totalOf(row.tasksDueSoon),
    };
  });
}
