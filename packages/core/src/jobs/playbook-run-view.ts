import { Effect } from "effect";

import {
  playbookStepViews,
  predecessorFromJob,
  seedValuesFromJson,
  requirePlaybook,
  type PlaybookDef,
} from "@watchdog/caps";
import type { PlaybookRunRow } from "@watchdog/db";
import type { PlaybookRunView } from "@watchdog/schemas/jobs";
import {
  isJsonObject,
  type CaseId,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import {
  assertCaseInOrgEffect,
  requireTrimmedGraphId,
} from "../graph/patch/guards";
import type { Db } from "../infra/db-service";
import { jobsRepoFxDb, playbookRunsRepoFxDb } from "../infra/repos-fx";
import {
  InternalError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";

/** The run's recipe, or the 500 for a run whose Playbook left the catalog (not caller input). */
function playbookOfRun(
  run: Pick<PlaybookRunRow, "id" | "playbookId">
): Effect.Effect<PlaybookDef, InternalError> {
  return Effect.try({
    try: () => requirePlaybook(run.playbookId),
    catch: (cause) =>
      new InternalError({
        reason: "Failed to read the playbook run",
        cause,
      }),
  });
}

/**
 * One Playbook run in its Case: the run's status and outcome plus each recipe step's outcome
 * (`playbookStepViews`, the same derivation the run's advance uses), skipped steps and their
 * reasons included. A run of another Case or organization is `NotFound`.
 */
export function getPlaybookRunForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  playbookRunId: string
): Effect.Effect<PlaybookRunView, DomainTag, Db> {
  return Effect.gen(function* getPlaybookRunGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const runId = yield* requireTrimmedGraphId(playbookRunId, "Playbook run");
    const run = yield* playbookRunsRepoFxDb.getInCase(scopedCaseId, runId);
    if (!run) {
      return yield* new NotFoundError({ entity: "Playbook run", id: runId });
    }
    const playbook = yield* playbookOfRun(run);
    // A run's step Jobs always carry their step; a row without one is not a step of this run.
    const members = (yield* jobsRepoFxDb.listForPlaybookRun(run.id))
      .filter((row) => row.playbookStep !== null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const steps = playbookStepViews(
      playbook,
      isJsonObject(run.seed) ? seedValuesFromJson(run.seed) : {},
      members.flatMap((row) =>
        row.playbookStep === null
          ? []
          : [{ step: row.playbookStep, status: row.status }]
      ),
      members.map((row) => predecessorFromJob(row))
    );
    return {
      id: run.id,
      caseId: run.caseId,
      playbookId: run.playbookId,
      status: run.status,
      outcome: run.outcome,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      steps: steps.map((view) => ({
        ...view,
        jobIds: members
          .filter((row) => row.playbookStep === view.step)
          .map((row) => row.id),
      })),
    };
  });
}
