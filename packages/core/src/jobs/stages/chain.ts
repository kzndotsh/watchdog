import { Effect } from "effect";

import {
  decidePlaybookAdvance,
  requireCapability,
  requirePlaybook,
  normalizePlaybookStep,
  predecessorFromJob,
  seedValuesFromJson,
} from "@watchdog/caps";
import type { DbExec, JobRow } from "@watchdog/db";
import {
  isJsonObject,
  isOpenJobStatus,
  parseTrimmedUuid,
  type CaseId,
  type JsonObject,
} from "@watchdog/schemas/shared";

import { nowDateEffect } from "../../infra/clock";
import type { Db } from "../../infra/db-service";
import { requireWritten } from "../../infra/postgres-effect";
import { transact } from "../../infra/postgres-tx";
import { jobsRepoFx, playbookRunsRepoFx } from "../../infra/repos-fx";
import type { DomainTag } from "../../infra/tagged-errors";
import { enqueueCapJobEffect } from "../boss";
import { parseValidatedCapInputEffect } from "../cap-input";
import { appendJobActivityEffect } from "../job-activity";
import type { JobQueue } from "../job-queue";

type ReleasedJob = {
  id: string;
  capabilityId: string;
};

type AdvanceOutcome = {
  jobs: ReleasedJob[];
};

function maybeFinishPlaybookRunEffect(
  exec: DbExec,
  playbookRunId: string
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* maybeFinishPlaybookRunGen() {
    const members = yield* jobsRepoFx.listStatusesForPlaybookRun(
      exec,
      playbookRunId
    );
    if (members.some((m) => isOpenJobStatus(m.status))) return;
    const finishedAt = yield* nowDateEffect;
    yield* playbookRunsRepoFx.setStatus(
      exec,
      playbookRunId,
      "finished",
      finishedAt,
      {
        onlyStatuses: ["running"],
      }
    );
  });
}

function enqueueReleasedEffect(
  released: ReleasedJob[]
): Effect.Effect<void, never, JobQueue> {
  if (released.length === 0) return Effect.void;
  return Effect.gen(function* enqueueReleasedGen() {
    yield* Effect.forEach(
      released,
      (row) => enqueueCapJobEffect(row.id, row.capabilityId).pipe(Effect.orDie),
      { concurrency: "unbounded" }
    );
  });
}

function enqueueStepJobsEffect(opts: {
  tx: DbExec;
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
}): Effect.Effect<ReleasedJob[], DomainTag> {
  const { tx, run, playbookRunId, jobs, step, capabilityId, inputs } = opts;
  const cap = requireCapability(capabilityId);
  return Effect.gen(function* enqueueStepJobsGen() {
    const created: ReleasedJob[] = [];
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
          created.push({ id: row.id, capabilityId: row.capabilityId });
        }),
      { concurrency: 1 }
    );
    return created;
  });
}

export function advancePlaybookRunEffect(input: {
  playbookRunId: string;
  /** Not read: entries carry the run's own Case. Kept so callers need no change. */
  caseId?: CaseId;
}): Effect.Effect<void, DomainTag, Db | JobQueue> {
  const playbookRunId = parseTrimmedUuid(input.playbookRunId) ?? undefined;
  if (playbookRunId === undefined) return Effect.void;
  return Effect.gen(function* advancePlaybookRunGen() {
    const outcome = yield* transact((tx) =>
      Effect.gen(function* advancePlaybookTx() {
        const run = yield* playbookRunsRepoFx.lock(tx, playbookRunId);
        if (!run || run.status !== "running") {
          return {
            jobs: [] as ReleasedJob[],
          } satisfies AdvanceOutcome;
        }

        const playbook = requirePlaybook(run.playbookId);
        const seed = isJsonObject(run.seed) ? seedValuesFromJson(run.seed) : {};
        const jobs = yield* jobsRepoFx.listForPlaybookRun(tx, playbookRunId);
        const predecessors = jobs.map((row) => predecessorFromJob(row));
        const views = jobs.map((row) => ({
          step: row.playbookStep ?? 0,
          status: row.status,
        }));
        const decision = decidePlaybookAdvance(
          playbook,
          seed,
          views,
          predecessors
        );

        switch (decision.kind) {
          case "wait": {
            return {
              jobs: [],
            } satisfies AdvanceOutcome;
          }
          case "finish": {
            yield* maybeFinishPlaybookRunEffect(tx, playbookRunId);
            return {
              jobs: [],
            } satisfies AdvanceOutcome;
          }
          case "abandon": {
            yield* maybeFinishPlaybookRunEffect(tx, playbookRunId);
            return {
              jobs: [],
            } satisfies AdvanceOutcome;
          }
          case "enqueue": {
            const def = normalizePlaybookStep(playbook.steps[decision.step]);
            const created = yield* enqueueStepJobsEffect({
              tx,
              run,
              playbookRunId,
              jobs,
              step: decision.step,
              capabilityId: def.capabilityId,
              inputs: decision.inputs,
            });
            return {
              jobs: created,
            } satisfies AdvanceOutcome;
          }
          default: {
            const _exhaustive: never = decision;
            return _exhaustive;
          }
        }
      })
    );

    yield* enqueueReleasedEffect(outcome.jobs);
  });
}
