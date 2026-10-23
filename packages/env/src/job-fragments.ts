import { z } from "zod";

import type { EnvFieldMeta } from "./meta";

/**
 * The worker and Job field groups: the lanes the worker runs Jobs in, how often a running Job's
 * log is saved, and the Job start limits. Split from `fragments.ts`, which spreads them in the
 * same order so `envGroups` and the generated reference do not change.
 */

const meta = (value: EnvFieldMeta): EnvFieldMeta => value;

/** One lane's concurrency: how many of its Jobs a worker process runs at once. */
function laneConcurrencyField(
  lane: string,
  fallback: number,
  description: string
) {
  return z.coerce
    .number()
    .int()
    .min(1)
    .max(64)
    .default(fallback)
    .meta(
      meta({
        description: `${description} Per worker process; a second worker adds its own slots. Each running Job can hold a database connection, and the worker's pool has 10: the worker refuses to start when the three lane settings sum to more than 8 (the pool minus 2 kept for its own loops). Applies to the ${lane} lane only.`,
        sensitive: false,
        usedBy: ["worker"],
        example: String(fallback),
      })
    );
}

/**
 * Worker lanes (#478): a Cap runs in the lane its descriptor implies (`capLane`), system Jobs
 * in heavy, and each lane has its own slots, so a slow Job never delays a quick one.
 */
export const workerLaneFields = {
  WD_WORKER_QUICK_CONCURRENCY: laneConcurrencyField(
    "quick",
    4,
    "How many quick lookups run at once (Caps that make one provider call, like DNS, WHOIS, IP and URL lookups)."
  ),
  WD_WORKER_HEAVY_CONCURRENCY: laneConcurrencyField(
    "heavy",
    2,
    "How many heavy Jobs run at once (Caps that parse stored Evidence, Caps flagged slow, and large Case exports)."
  ),
  WD_WORKER_ACT_CONCURRENCY: laneConcurrencyField(
    "act",
    2,
    "How many action Jobs run at once (Caps that change something at a provider, like submitting a URL to an archive). An action Job is never run twice: if its worker dies mid-run, reconcile fails it and you start it again."
  ),
};

export const jobLogFields = {
  WD_JOB_LOG_MAX_LINES: z.coerce
    .number()
    .int()
    .min(10)
    .max(100_000)
    .default(1000)
    .meta(
      meta({
        description:
          "Most log lines one Job keeps. Past it the Job's log ends with a truncation marker and later lines are dropped (the Job still runs). Lines are also cut to 1000 characters.",
        sensitive: false,
        usedBy: ["worker"],
        example: "1000",
      })
    ),
  WD_JOB_LOG_MAX_KB: z.coerce
    .number()
    .int()
    .min(1)
    .max(8192)
    .default(128)
    .meta(
      meta({
        description:
          "Most kilobytes of log text one Job keeps, with the same truncation marker as the line limit. Each save rewrites the Job's log, so a high value costs database writes on a chatty Cap.",
        sensitive: false,
        usedBy: ["worker"],
        example: "128",
      })
    ),
  WD_JOB_LOG_FLUSH_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(1000)
    .meta(
      meta({
        description:
          "How often, in milliseconds, a running Job's new log lines are saved and pushed to open Job pages. A Job saves at most once per interval however many lines it logs, and once more when it ends.",
        sensitive: false,
        usedBy: ["worker"],
        example: "1000",
      })
    ),
};

/** Largest Job start limit an operator may configure: a typo guard, not a policy. */
const MAX_JOB_START_LIMIT = 1_000_000;

export const jobStartLimitFields = {
  WD_JOB_START_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .min(10)
    .max(86_400)
    .default(3600)
    .meta(
      meta({
        description:
          "Length, in seconds, of the fixed window Job starts are counted in (per organization and per API key). The count resets when a window ends; a refused start says how many seconds remain. A window boundary lets a caller use two windows' worth of starts back to back.",
        sensitive: false,
        usedBy: ["web", "worker"],
        example: "3600",
      })
    ),
  WD_JOB_START_LIMIT_ORG: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_JOB_START_LIMIT)
    .default(600)
    .meta(
      meta({
        description:
          "How many Jobs an organization may start per window (Cap runs, Playbook runs, retries and Case exports that run as a Job; every Playbook step after the first is part of its run and not counted). Over it, a start is refused with HTTP 429 and the code job_start_limited. An instance admin can set a different limit for one organization, and an owner or admin can lower it, through the API.",
        sensitive: false,
        usedBy: ["web", "worker"],
        example: "600",
      })
    ),
  WD_JOB_START_LIMIT_KEY: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_JOB_START_LIMIT)
    .default(120)
    .meta(
      meta({
        description:
          "How many Jobs one API key may start per window, counted next to the organization limit (a start must fit both). Keeps one runaway agent from using the whole organization's budget. An owner or admin can set a different limit for one key through the API.",
        sensitive: false,
        usedBy: ["web", "worker"],
        example: "120",
      })
    ),
};
