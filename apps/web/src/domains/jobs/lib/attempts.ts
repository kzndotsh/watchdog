import type { JobListRecord } from "@watchdog/core/jobs";

type AttemptRow = Pick<JobListRecord, "id" | "retryOfJobId" | "createdAt">;

/**
 * The attempts around `jobId`, oldest first: the first attempt it descends from and every
 * retry that came after it (a Job retried twice has two later attempts). A Job nobody
 * retried and that retries nothing is a chain of one. A parent missing from `jobs` ends the
 * walk up, and a cycle (which the database cannot produce) cannot loop.
 */
export function attemptChain<T extends AttemptRow>(
  jobs: readonly T[],
  jobId: string
): T[] {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const start = byId.get(jobId);
  if (start === undefined) return [];

  let root = start;
  const seen = new Set([root.id]);
  while (root.retryOfJobId !== null) {
    const parent = byId.get(root.retryOfJobId);
    if (parent === undefined || seen.has(parent.id)) break;
    seen.add(parent.id);
    root = parent;
  }

  const retriesOf = new Map<string, T[]>();
  for (const job of jobs) {
    if (job.retryOfJobId === null) continue;
    retriesOf.set(job.retryOfJobId, [
      ...(retriesOf.get(job.retryOfJobId) ?? []),
      job,
    ]);
  }

  const chain: T[] = [];
  const queued = new Set([root.id]);
  const pending = [root];
  for (let job = pending.shift(); job !== undefined; job = pending.shift()) {
    chain.push(job);
    for (const retry of retriesOf.get(job.id) ?? []) {
      if (queued.has(retry.id)) continue;
      queued.add(retry.id);
      pending.push(retry);
    }
  }
  return chain.sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );
}
