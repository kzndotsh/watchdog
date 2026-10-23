/** The worker lanes a Job runs in; each has its own concurrency (`WD_WORKER_*_CONCURRENCY`). */
export const JOB_LANES = ["quick", "heavy", "act"] as const;

export type JobLane = (typeof JOB_LANES)[number];

/**
 * The lane a Cap runs in, from what its descriptor already says: an `act` Cap is `act`; a
 * `process` Cap (it reads and parses stored Evidence) or a `slow`-flagged one is `heavy`;
 * every other Cap is a `quick` lookup. A Cap that needs another lane sets `lane` itself.
 */
export function capLane(cap: {
  readonly kind?: "collect" | "enrich" | "process" | "act";
  readonly flags?: readonly string[];
  readonly lane?: JobLane;
}): JobLane {
  if (cap.lane !== undefined) return cap.lane;
  if (cap.kind === "act") return "act";
  if (cap.kind === "process" || cap.flags?.includes("slow")) return "heavy";
  return "quick";
}
