import { Effect } from "effect";

import {
  decidePlaybookAdvance,
  requirePlaybook,
  normalizePlaybookStep,
  predecessorFromJob,
  seedValuesFromJson,
} from "@watchdog/caps";
import {
  jobsRepo,
  playbookRunsRepo,
  type DbExec,
  type JobRow,
} from "@watchdog/db";
import {
  isJsonObject,
  isOpenJobStatus,
  type JsonObject,
} from "@watchdog/schemas";

import { notifyJobUpdateEffect } from "../../infra/events";
import { tryDb } from "../../infra/postgres-effect";
import { transact } from "../../infra/postgres-tx";
import { toDomainError, type DomainTag } from "../../infra/tagged-errors";
import { enqueueCapJobEffect } from "../boss";

interface ReleasedJob {
  id: string;
  capabilityId: string;
}

interface AdvanceOutcome {
  jobs: ReleasedJob[];
  caseId: string | undefined;
}

function maybeFinishPlaybookRunEffect(
  exec: DbExec,
  playbookRunId: string
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* maybeFinishPlaybookRunGen() {
    const members = yield* tryDb(() =>
      jobsRepo.listStatusesForPlaybookRun(exec, playbookRunId)
    );
    if (members.some((m) => isOpenJobStatus(m.status))) return;
    yield* tryDb(() =>
      playbookRunsRepo.setStatus(exec, playbookRunId, "finished", new Date(), {
        onlyStatuses: ["running"],
      })
    );
  });
}

function enqueueReleasedEffect(
  caseId: string,
  _playbookRunId: string,
  released: ReleasedJob[]
): Effect.Effect<void> {
  if (released.length === 0) return Effect.void;
  return Effect.gen(function* enqueueReleasedGen() {
    yield* Effect.forEach(
      released,
      (row) => enqueueCapJobEffect(row.id, row.capabilityId).pipe(Effect.orDie),
      { concurrency: "unbounded" }
    );
    yield* Effect.forEach(
      released,
      (row) => notifyJobUpdateEffect(caseId, row.id, "queued"),
      { concurrency: "unbounded" }
    );
  });
}

function enqueueStepJobsEffect(opts: {
  tx: DbExec;
  run: {
    caseId: string;
    actorId: string;
    actorLabel: string | null;
  };
  playbookRunId: string;
  jobs: JobRow[];
  step: number;
  capabilityId: string;
  inputs: JsonObject[];
}): Effect.Effect<ReleasedJob[], DomainTag> {
  const { tx, run, playbookRunId, jobs, step, capabilityId, inputs } = opts;
  return Effect.gen(function* enqueueStepJobsGen() {
    const created: ReleasedJob[] = [];
    yield* Effect.forEach(
      inputs.map((jobInput, fanIndex) => ({ jobInput, fanIndex })),
      ({ jobInput, fanIndex }) =>
        Effect.gen(function* enqueueOneStepJob() {
          const existing = jobs.find(
            (j) => j.playbookStep === step && j.playbookFanIndex === fanIndex
          );
          if (existing) {
            if (existing.status === "blocked") {
              yield* tryDb(() =>
                jobsRepo.update(tx, existing.id, {
                  input: jobInput,
                  status: "queued",
                })
              );
              created.push({
                id: existing.id,
                capabilityId: existing.capabilityId,
              });
            }
            return;
          }
          const row = yield* tryDb(() =>
            jobsRepo.create(tx, {
              caseId: run.caseId,
              capabilityId,
              input: jobInput,
              status: "queued",
              actorId: run.actorId,
              actorLabel: run.actorLabel,
              logs: [],
              playbookRunId,
              playbookStep: step,
              playbookFanIndex: fanIndex,
            })
          );
          if (!row) {
            return yield* Effect.die(
              new Error(
                `Failed to create playbook Job at step ${step} · ${fanIndex}`
              )
            );
          }
          created.push({ id: row.id, capabilityId: row.capabilityId });
        }),
      { concurrency: 1 }
    );
    return created;
  });
}

export function advancePlaybookRunEffect(input: {
  playbookRunId: string;
  caseId?: string;
}): Effect.Effect<void> {
  const { playbookRunId } = input;
  return Effect.gen(function* advancePlaybookRunGen() {
    const outcome = yield* transact((tx) =>
      Effect.gen(function* advancePlaybookTx() {
        const run = yield* tryDb(() =>
          playbookRunsRepo.lock(tx, playbookRunId)
        );
        if (!run || run.status !== "running") {
          return {
            jobs: [] as ReleasedJob[],
            caseId: input.caseId,
          } satisfies AdvanceOutcome;
        }

        const playbook = requirePlaybook(run.playbookId);
        const seed = isJsonObject(run.seed) ? seedValuesFromJson(run.seed) : {};
        const jobs = yield* tryDb(() =>
          jobsRepo.listForPlaybookRun(tx, playbookRunId)
        );
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
            return { jobs: [], caseId: run.caseId } satisfies AdvanceOutcome;
          }
          case "finish": {
            yield* maybeFinishPlaybookRunEffect(tx, playbookRunId);
            return { jobs: [], caseId: run.caseId } satisfies AdvanceOutcome;
          }
          case "abandon": {
            yield* tryDb(() =>
              jobsRepo.abandonBlockedForPlaybook(
                tx,
                playbookRunId,
                decision.reason
              )
            );
            yield* maybeFinishPlaybookRunEffect(tx, playbookRunId);
            return { jobs: [], caseId: run.caseId } satisfies AdvanceOutcome;
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
              caseId: run.caseId,
            } satisfies AdvanceOutcome;
          }
          default: {
            const _exhaustive: never = decision;
            return _exhaustive;
          }
        }
      })
    );

    const caseId = outcome.caseId ?? input.caseId;
    if (caseId === undefined) return;
    yield* enqueueReleasedEffect(caseId, playbookRunId, outcome.jobs);
  }).pipe(Effect.mapError(toDomainError), Effect.orDie);
}
