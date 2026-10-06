import { Effect } from "effect";

import {
  entitiesRepo,
  evidenceRepo,
  activityLogRepo,
  type JobActivityLabelRow,
  type RecentActivityLogRow,
} from "@watchdog/db";
import type { ActivityItem } from "@watchdog/schemas/feed";
import {
  entityIdsFromJobInputs,
  entityTitleMapForJobInputs,
  evidenceIdsFromJobInputs,
  evidenceTitleMapForJobInputs,
} from "@watchdog/schemas/jobs";
import {
  JOB_STATUSES,
  parseTrimmedUuid,
  type JobStatus,
  type JsonObject,
} from "@watchdog/schemas/shared";

import { labelForActor } from "../actors/resolve-actor-labels";
import type { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";
import { jobActivityLabel } from "../jobs/job-display";

/** The Job fields a feed label is built from: the Job itself, or a run's seed step. */
interface JobLabelSubject {
  caseId: string;
  capabilityId: string;
  input: JsonObject;
  resultSummary: string | null;
  playbookId: string | null;
}

/** Display verb for a Job status. */
function jobActivityAction(status: JobStatus): string {
  switch (status) {
    case "succeeded": {
      return "Succeeded";
    }
    case "failed": {
      return "Failed";
    }
    case "cancelled": {
      return "Cancelled";
    }
    case "running": {
      return "Running";
    }
    case "blocked": {
      return "Blocked";
    }
    case "queued": {
      return "Queued";
    }
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function jobStatusOfAction(action: string): JobStatus | undefined {
  return JOB_STATUSES.find((status) => status === action);
}

function pickResultSummary(
  steps: readonly JobActivityLabelRow[]
): string | null {
  const newestFirst = [...steps].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  for (const step of newestFirst) {
    const summary = step.resultSummary?.trim();
    if (summary) return summary;
  }
  return null;
}

/**
 * What labels a Job feed row. A solo entry takes its own Job. An entry with a
 * `group_id` (a playbook run) takes the run's seed step (lowest step, then fan
 * index) for capability and input, the run's playbook, and the newest step
 * result summary: the label a collapsed run showed before the log.
 */
export function jobLabelSubject(
  entry: Pick<RecentActivityLogRow, "subjectId" | "groupId">,
  labelRows: readonly JobActivityLabelRow[]
): JobLabelSubject | undefined {
  const runId = entry.groupId === null ? null : parseTrimmedUuid(entry.groupId);
  if (runId !== null) {
    const steps = labelRows.filter((row) => row.playbookRunId === runId);
    const seed = [...steps].sort(
      (a, b) =>
        (a.playbookStep ?? 0) - (b.playbookStep ?? 0) ||
        a.playbookFanIndex - b.playbookFanIndex
    )[0];
    if (seed === undefined) return undefined;
    return {
      caseId: seed.caseId,
      capabilityId: seed.capabilityId,
      input: seed.input,
      resultSummary: pickResultSummary(steps),
      playbookId: seed.playbookId,
    };
  }
  const job = labelRows.find((row) => row.id === entry.subjectId);
  if (job === undefined) return undefined;
  return {
    caseId: job.caseId,
    capabilityId: job.capabilityId,
    input: job.input,
    resultSummary: job.resultSummary,
    playbookId: job.playbookId,
  };
}

function idsByCase(
  subjects: readonly JobLabelSubject[],
  pick: (inputs: JsonObject[]) => string[]
): Map<string, string[]> {
  const inputsByCase = new Map<string, JsonObject[]>();
  for (const subject of subjects) {
    const bucket = inputsByCase.get(subject.caseId) ?? [];
    bucket.push(subject.input);
    inputsByCase.set(subject.caseId, bucket);
  }
  const out = new Map<string, string[]>();
  for (const [caseId, inputs] of inputsByCase) {
    const ids = pick(inputs);
    if (ids.length > 0) out.set(caseId, ids);
  }
  return out;
}

function inputsOfCase(
  subjects: readonly JobLabelSubject[],
  caseId: string
): JsonObject[] {
  return subjects
    .filter((subject) => subject.caseId === caseId)
    .map((subject) => subject.input);
}

function loadEntityTitleMapEffect(
  subjects: readonly JobLabelSubject[]
): Effect.Effect<ReadonlyMap<string, string>, DomainTag, Db> {
  const byCase = idsByCase(subjects, (inputs) =>
    entityIdsFromJobInputs(inputs)
  );
  return Effect.gen(function* loadEntityTitleMapGen() {
    const labels = new Map<string, string>();
    for (const [caseId, entityIds] of byCase) {
      const entityRows = yield* tryDbWith((exec) =>
        entitiesRepo.listNamesByIdsInCase(exec, caseId, entityIds)
      );
      for (const [id, label] of entityTitleMapForJobInputs(
        entityRows,
        inputsOfCase(subjects, caseId)
      )) {
        labels.set(id, label);
      }
    }
    return labels;
  });
}

function loadEvidenceTitleMapEffect(
  subjects: readonly JobLabelSubject[]
): Effect.Effect<ReadonlyMap<string, string>, DomainTag, Db> {
  const byCase = idsByCase(subjects, (inputs) =>
    evidenceIdsFromJobInputs(inputs)
  );
  return Effect.gen(function* loadEvidenceTitleMapGen() {
    const labels = new Map<string, string>();
    for (const [caseId, evidenceIds] of byCase) {
      const evidenceRows = yield* tryDbWith((exec) =>
        evidenceRepo.listActivityLabelsInCase(exec, caseId, evidenceIds)
      );
      for (const [id, title] of evidenceTitleMapForJobInputs(
        evidenceRows,
        inputsOfCase(subjects, caseId)
      )) {
        labels.set(id, title);
      }
    }
    return labels;
  });
}

/**
 * Job history for Recent activity (ADR-0005 decision 5). `rows` come from
 * `activityLogRepo.recentCollapsed`: one row per entry, collapsed by `group_id`
 * so a playbook run is one row (its newest entry). Labels are not stored on Job
 * entries; they are resolved here from the Job rows the entries point at.
 */
export function mapJobFeedRowsEffect(
  rows: readonly RecentActivityLogRow[],
  actors: ReadonlyMap<string, { name: string; email: string }>
): Effect.Effect<ActivityItem[], DomainTag, Db> {
  return Effect.gen(function* mapJobFeedRowsGen() {
    if (rows.length === 0) return [];
    const labelRows = yield* tryDbWith((exec) =>
      activityLogRepo.jobLabelRows(exec, {
        jobIds: rows.flatMap((row) =>
          row.groupId === null && row.subjectId !== null ? [row.subjectId] : []
        ),
        playbookRunIds: rows.flatMap((row) =>
          row.groupId === null ? [] : [row.groupId]
        ),
      })
    );
    const subjects = new Map(
      rows.map((row) => [row.id, jobLabelSubject(row, labelRows)] as const)
    );
    const known = [...subjects.values()].filter(
      (subject) => subject !== undefined
    );
    const evidenceTitleById = yield* loadEvidenceTitleMapEffect(known);
    const entityTitleById = yield* loadEntityTitleMapEffect(known);
    return rows.map((row): ActivityItem => {
      const subject = subjects.get(row.id);
      const status = jobStatusOfAction(row.action);
      return {
        id: String(row.id),
        kind: "job",
        action: status === undefined ? row.action : jobActivityAction(status),
        caseId: row.caseId,
        caseName: row.caseName,
        label:
          subject === undefined
            ? "Job"
            : jobActivityLabel({
                ...subject,
                evidenceTitleById,
                entityTitleById,
              }),
        status,
        at: row.at.toISOString(),
        actor:
          row.actorId === null
            ? undefined
            : labelForActor(row.actorId, actors, row.actorLabel),
      };
    });
  });
}
