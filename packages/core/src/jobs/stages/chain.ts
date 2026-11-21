import { Effect } from "effect";

import {
  decidePlaybookAdvance,
  requireCapability,
  requirePlaybook,
  normalizePlaybookStep,
  predecessorFromJob,
  seedValuesFromJson,
} from "@watchdog/caps";
import type { DbTx, JobRow } from "@watchdog/db";
import {
  isJsonObject,
  parseTrimmedUuid,
  type CaseId,
  type JsonObject,
} from "@watchdog/schemas/shared";

import { appendActivityEffect } from "../../activity/append";
import type { DomainTag } from "../../errors/tagged-errors";
import { nowDateEffect } from "../../infra/clock";
import type { Db } from "../../infra/db-service";
import { inCaseOrganizationIfFound } from "../../infra/organization-scope";
import { requireWritten } from "../../infra/postgres-effect";
import { transact } from "../../infra/postgres-tx";
import {
  jobsRepoFx,
  playbookRunsRepoFx,
  playbookRunsRepoFxDb,
} from "../../infra/repos-fx";
import { enqueueCapJobEffect } from "../boss";
import { parseValidatedCapInputEffect } from "../cap-input";
import { appendJobActivityEffect } from "../job-activity";
import type { JobQueue } from "../job-queue";

/** Create and queue a step's missing Jobs, each in the advance's transaction `tx` (#721). */
function enqueueStepJobsEffect(opts: {
  tx: DbTx;
  run: {
    caseId: CaseId;
    actorId: string;
    actorLabel: string | null;
    actorKeyId: string | null;
  };
  playbookRunId: string;
  jobs: JobRow[];
  step: number;
  capabilityId: string;
  inputs: JsonObject[];
}): Effect.Effect<void, DomainTag, JobQueue> {
  const { tx, run, playbookRunId, jobs, step, capabilityId, inputs } = opts;
  const cap = requireCapability(capabilityId);
  return Effect.gen(function* enqueueStepJobsGen() {
    yield* Effect.forEach(
      inputs.map((jobInput, fanIndex) => ({ jobInput, fanIndex })),
      ({ jobInput, fanIndex }) =>
        Effect.gen(function* enqueueOneStepJob() {
          const normalizedInput = yield* parseValidatedCapInputEffect(
            cap,
            jobInput
          );
          const existing = jobs.find(
            (j) => j.playbookStep === step && j.playbookFanIndex === fanIndex
          );
          if (existing) return;
          const row = yield* jobsRepoFx
            .create(tx, {
              caseId: run.caseId,
              capabilityId,
              input: normalizedInput,
              status: "queued",
              actorId: run.actorId,
              actorLabel: run.actorLabel,
              actorKeyId: run.actorKeyId,
              logs: [],
              playbookRunId,
              playbookStep: step,
              playbookFanIndex: fanIndex,
            })
            .pipe(
              requireWritten(
                `create playbook Job at step ${step} · ${fanIndex}`
              )
            );
          yield* appendJobActivityEffect(tx, row, "queued");
          yield* enqueueCapJobEffect(tx, row.id, row.capabilityId);
        }),
      { concurrency: 1, discard: true }
    );
  });
}

function advancePlaybookRunInScope(
  playbookRunId: string
): Effect.Effect<void, DomainTag, Db | JobQueue> {
  return Effect.gen(function* advancePlaybookRunGen() {
    yield* transact((tx) =>
      Effect.gen(function* advancePlaybookTx() {
        const run = yield* playbookRunsRepoFx.lock(tx, playbookRunId);
        if (!run || run.status !== "running") return;

        const playbook = requirePlaybook(run.playbookId);
        const seed = isJsonObject(run.seed) ? seedValuesFromJson(run.seed) : {};
        // A run's step Jobs always carry their step; a row without one is not a step of this
        // run, so it is left out rather than read as step 0.
        const jobs = (yield* jobsRepoFx.listForPlaybookRun(
          tx,
          playbookRunId
        )).filter((row) => row.playbookStep !== null);
        const predecessors = jobs.map((row) => predecessorFromJob(row));
        const views = jobs.flatMap((row) =>
          row.playbookStep === null
            ? []
            : [{ step: row.playbookStep, status: row.status }]
        );
        const decision = decidePlaybookAdvance(
          playbook,
          seed,
          views,
          predecessors
        );

        switch (decision.kind) {
          case "wait": {
            return;
          }
          case "finish": {
            const finishedAt = yield* nowDateEffect;
            // Locked as `running` above, so `finish` must write a row; a miss is a server bug.
            const finished = yield* playbookRunsRepoFx
              .finish(tx, playbookRunId, decision.outcome, finishedAt)
              .pipe(requireWritten("finish playbook run"));
            yield* appendActivityEffect(tx, {
              caseId: finished.caseId,
              kind: "playbook_run",
              action: "finished",
              subjectId: finished.id,
              groupId: finished.id,
              actorId: finished.actorId,
              actorLabel: finished.actorLabel,
              actorKeyId: finished.actorKeyId,
              toValue: decision.outcome,
            });
            return;
          }
          case "enqueue": {
            const def = normalizePlaybookStep(playbook.steps[decision.step]);
            yield* enqueueStepJobsEffect({
              tx,
              run,
              playbookRunId,
              jobs,
              step: decision.step,
              capabilityId: def.capabilityId,
              inputs: decision.inputs,
            });
            return;
          }
          default: {
            const _exhaustive: never = decision;
            return _exhaustive;
          }
        }
      })
    );
  });
}

export function advancePlaybookRunEffect(input: {
  playbookRunId: string;
}): Effect.Effect<void, DomainTag, Db | JobQueue> {
  const playbookRunId = parseTrimmedUuid(input.playbookRunId) ?? undefined;
  if (playbookRunId === undefined) return Effect.void;
  // In the run's Case's organization (row-level security, #718, #719). Every caller is already
  // in an organization's scope (the Job run, reconcile's per-row repair), where the run is read;
  // unscoped, or in another organization, the run is not found and nothing advances (fail
  // closed), as for a run that is gone.
  return Effect.flatMap(playbookRunsRepoFxDb.get(playbookRunId), (found) =>
    found === null
      ? Effect.void
      : inCaseOrganizationIfFound(
          found.caseId,
          advancePlaybookRunInScope(playbookRunId)
        )
  );
}
