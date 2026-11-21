import { orpc } from "@/lib/orpc-client";

/** Rows the Case overview reads: its newest Jobs, one page, for the Recent activity feed. */
export const RECENT_JOBS_LIMIT = 50;

/**
 * Jobs keys are the oRPC procedure keys: `all(caseId)` is `[["jobs"], { input: { caseId } }]`,
 * every Jobs query of the Case whatever its procedure. The other members are the exact keys of
 * single reads, all under `all`, so every Job mutation and SSE refresh of the Case reaches them.
 */
export const jobsKeys = {
  all: (caseId: string) => orpc.jobs.key({ input: { caseId } }),
  /** The Case's newest Jobs (`jobs.listForCase`, one page). */
  recent: (caseId: string) =>
    orpc.jobs.listForCase.key({
      type: "query",
      input: { caseId, limit: RECENT_JOBS_LIMIT },
    }),
  detail: (caseId: string, jobId: string) =>
    orpc.jobs.get.key({ type: "query", input: { caseId, jobId } }),
  playbookRun: (caseId: string, playbookRunId: string) =>
    orpc.jobs.getPlaybookRun.key({
      type: "query",
      input: { caseId, playbookRunId },
    }),
  /** A Job's status change (SSE) refreshes the calls it made. */
  providerCalls: (caseId: string, jobId: string) =>
    orpc.jobs.listProviderCalls.key({
      type: "query",
      input: { caseId, jobId },
    }),
  /** Names who holds each value, so Add to Entity refreshes it too. */
  found: (caseId: string, jobId: string) =>
    orpc.jobs.listFound.key({ type: "query", input: { caseId, jobId } }),
};

/**
 * Artifact bodies: addressed by content (a Job artifact by its sha256), so they never change, and
 * they can be large. Their own root keeps them out of every domain invalidation (not the
 * procedure keys, which sit under `jobsKeys.all` / `evidenceKeys.all`): a Job's status change
 * must not re-download an open artifact.
 */
export const artifactKeys = {
  all: ["artifact"] as const,
  job: (caseId: string, jobId: string, sha256: string, mime: string) =>
    ["artifact", "job", caseId, jobId, sha256, mime] as const,
  evidence: (caseId: string, evidenceId: string, mime: string) =>
    ["artifact", "evidence", caseId, evidenceId, mime] as const,
};
