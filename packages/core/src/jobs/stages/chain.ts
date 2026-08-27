import {
  decidePlaybookAdvance,
  requirePlaybook,
  normalizePlaybookStep,
  predecessorFromJob,
  seedValuesFromJson,
} from "@watchdog/caps";
import {
  db,
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

import { notifyEvent } from "../../infra/events";
import { logSwallowed } from "../../infra/process-log";
import { enqueueCapJob } from "../boss";

function maybeFinishPlaybookRun(
  exec: DbExec,
  playbookRunId: string
): Promise<void> {
  return jobsRepo
    .listStatusesForPlaybookRun(exec, playbookRunId)
    .then((members) => {
      if (members.some((m) => isOpenJobStatus(m.status))) return;
      return playbookRunsRepo.setStatus(
        exec,
        playbookRunId,
        "finished",
        new Date(),
        {
          onlyStatuses: ["running"],
        }
      );
    })
    .then(() => {});
}

interface ReleasedJob {
  id: string;
  capabilityId: string;
}

function enqueueReleased(
  caseId: string,
  playbookRunId: string,
  released: ReleasedJob[]
): Promise<void> {
  if (released.length === 0) return Promise.resolve();
  return Promise.all(
    released.map((row) => enqueueCapJob(row.id, row.capabilityId))
  )
    .then(() =>
      Promise.all(
        released.map((row) =>
          notifyEvent({
            type: "job_update",
            caseId,
            jobId: row.id,
            status: "queued",
          }).catch((notifyError: unknown) => {
            logSwallowed("playbook.notify", notifyError, {
              caseId,
              playbookRunId,
              jobId: row.id,
            });
          })
        )
      )
    )
    .then(() => {});
}

function enqueueStepJobs(opts: {
  tx: DbExec;
  run: {
    caseId: string;
    actorId: string;
  };
  playbookRunId: string;
  jobs: JobRow[];
  step: number;
  capabilityId: string;
  inputs: JsonObject[];
}): Promise<ReleasedJob[]> {
  return (async () => {
    const { tx, run, playbookRunId, jobs, step, capabilityId, inputs } = opts;
    const created: ReleasedJob[] = [];
    for (let i = 0; i < inputs.length; i += 1) {
      const existing = jobs.find(
        (j) => j.playbookStep === step && j.playbookFanIndex === i
      );
      if (existing) {
        if (existing.status === "blocked") {
          // oxlint-disable-next-line no-await-in-loop -- same-tx ordered fan-index updates
          await jobsRepo.update(tx, existing.id, {
            input: inputs[i],
            status: "queued",
          });
          created.push({
            id: existing.id,
            capabilityId: existing.capabilityId,
          });
        }
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- same-tx ordered fan-index inserts
      const row = await jobsRepo.create(tx, {
        caseId: run.caseId,
        capabilityId,
        input: inputs[i],
        status: "queued",
        actorId: run.actorId,
        logs: [],
        playbookRunId,
        playbookStep: step,
        playbookFanIndex: i,
      });
      if (!row) {
        throw new Error(`Failed to create playbook Job at step ${step} · ${i}`);
      }
      created.push({ id: row.id, capabilityId: row.capabilityId });
    }
    return created;
  })();
}

export function advancePlaybookRun(input: {
  playbookRunId: string;
  caseId?: string;
}): Promise<void> {
  const { playbookRunId } = input;
  return db
    .transaction(async (tx) => {
      const run = await playbookRunsRepo.lock(tx, playbookRunId);
      if (!run || run.status !== "running") {
        return { jobs: [] as ReleasedJob[], caseId: input.caseId };
      }

      const playbook = requirePlaybook(run.playbookId);
      const seed = isJsonObject(run.seed) ? seedValuesFromJson(run.seed) : {};
      const jobs = await jobsRepo.listForPlaybookRun(tx, playbookRunId);
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
          return { jobs: [], caseId: run.caseId };
        }
        case "finish": {
          await maybeFinishPlaybookRun(tx, playbookRunId);
          return { jobs: [], caseId: run.caseId };
        }
        case "abandon": {
          await jobsRepo.abandonBlockedForPlaybook(
            tx,
            playbookRunId,
            decision.reason
          );
          await maybeFinishPlaybookRun(tx, playbookRunId);
          return { jobs: [], caseId: run.caseId };
        }
        case "enqueue": {
          const def = normalizePlaybookStep(playbook.steps[decision.step]);
          const created = await enqueueStepJobs({
            tx,
            run,
            playbookRunId,
            jobs,
            step: decision.step,
            capabilityId: def.capabilityId,
            inputs: decision.inputs,
          });
          return { jobs: created, caseId: run.caseId };
        }
        default: {
          const _exhaustive: never = decision;
          return _exhaustive;
        }
      }
    })
    .then((outcome) => {
      const caseId = outcome.caseId ?? input.caseId;
      if (caseId === undefined) return;
      return enqueueReleased(caseId, playbookRunId, outcome.jobs);
    });
}
