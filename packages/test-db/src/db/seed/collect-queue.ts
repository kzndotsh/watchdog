import {
  evidence,
  jobEvidence,
  jobs,
  playbookRuns,
  type DbExec,
} from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  COLLECT_FIXTURE_EVIDENCE,
  COLLECT_FIXTURE_JOBS,
  COLLECT_FIXTURE_RUNS,
} from "@watchdog/schemas/testing";
import { TEST_ACTOR_ID } from "@watchdog/test-kit/fixtures";

import { flushCollectQueue } from "../collect-queue";

function at(micros: number): Date {
  return new Date(micros / 1000);
}

function maybeAt(micros: number | null): Date | null {
  return micros === null ? null : at(micros);
}

/**
 * Seed Collect's 12-case fixture (`@watchdog/schemas/testing`) into `caseId`, then flush the
 * queue. Direct inserts, not repos: the fixture fixes every id and time (created, started,
 * finished, captured, hidden), which no repo accepts. Parents first (runs, Evidence, Jobs in
 * retry order), then the landing links in order.
 */
export async function seedCollectQueueFixture(
  exec: DbExec,
  caseId: CaseId
): Promise<void> {
  await exec.insert(playbookRuns).values(
    COLLECT_FIXTURE_RUNS.map((run) => ({
      id: run.id,
      caseId,
      playbookId: run.playbookId,
      seed: {},
      actorId: TEST_ACTOR_ID,
      createdAt: at(run.createdAt),
    }))
  );
  await exec.insert(evidence).values(
    COLLECT_FIXTURE_EVIDENCE.map((row) => ({
      id: row.id,
      caseId,
      entityId: row.entityId,
      kind: "attestation" as const,
      label: row.label,
      notes: row.notes,
      text: "fixture body",
      sourceUrl: row.sourceUrl,
      actorId: TEST_ACTOR_ID,
      capturedAt: at(row.capturedAt),
      processedAt: maybeAt(row.processedAt),
      deletedAt: maybeAt(row.deletedAt),
    }))
  );
  // A retry references the Job it repeats, so first attempts go in first.
  const ordered = [...COLLECT_FIXTURE_JOBS].sort(
    (a, b) => Number(a.retryOfJobId !== null) - Number(b.retryOfJobId !== null)
  );
  await exec.insert(jobs).values(
    ordered.map((job) => ({
      id: job.id,
      caseId,
      capabilityId: job.capabilityId,
      input: job.input,
      status: job.status,
      error: job.error,
      resultSummary: job.resultSummary,
      actorId: TEST_ACTOR_ID,
      playbookRunId: job.playbookRunId,
      playbookStep: job.playbook?.step ?? null,
      playbookFanIndex: job.playbook?.fan ?? 0,
      retryOfJobId: job.retryOfJobId,
      createdAt: at(job.createdAt),
      updatedAt: at(job.finishedAt ?? job.startedAt ?? job.createdAt),
      startedAt: maybeAt(job.startedAt),
      finishedAt: maybeAt(job.finishedAt),
    }))
  );
  const links = COLLECT_FIXTURE_JOBS.flatMap((job) =>
    job.evidenceIds.map((evidenceId, position) => ({
      jobId: job.id,
      evidenceId,
      caseId,
      position,
    }))
  );
  await exec.insert(jobEvidence).values(links);
  await flushCollectQueue(exec);
}
