import { Cause, Effect, Fiber } from "effect";

import type { JobRow } from "@watchdog/db";
import { env } from "@watchdog/env/server";

import type { Db } from "../infra/db-service";
import { transact } from "../infra/postgres-tx";
import { logSwallowed } from "../infra/process-log";
import { jobsRepoFx } from "../infra/repos-fx";
import type { DomainTag } from "../infra/tagged-errors";
import { appendJobLogActivityEffect } from "./job-activity";

/** The defaults of `WD_JOB_LOG_*`, for a process where `env` is not validated (lint, unit tests). */
const DEFAULT_MAX_LINES = 1000;
const DEFAULT_MAX_KB = 128;
const DEFAULT_FLUSH_MS = 1000;
const BYTES_PER_KB = 1024;

/** One line is cut here, whatever the line limit: a Cap logging a whole body must not fill the budget. */
export const JOB_LOG_MAX_LINE_CHARS = 1000;

/** What a Job's log keeps and how often it is saved (`WD_JOB_LOG_*`), in the units the code uses. */
export type JobLogSettings = {
  readonly maxLines: number;
  readonly maxBytes: number;
  readonly flushMs: number;
};

/** Read at call time, so the worker and the tests always agree. */
export function jobLogSettings(): JobLogSettings {
  const maxLines: number | undefined = env.WD_JOB_LOG_MAX_LINES;
  const maxKb: number | undefined = env.WD_JOB_LOG_MAX_KB;
  const flushMs: number | undefined = env.WD_JOB_LOG_FLUSH_MS;
  return {
    maxLines: maxLines ?? DEFAULT_MAX_LINES,
    maxBytes: (maxKb ?? DEFAULT_MAX_KB) * BYTES_PER_KB,
    flushMs: flushMs ?? DEFAULT_FLUSH_MS,
  };
}

/** The last line of a log that hit its bound; later lines are dropped. */
export function jobLogTruncationMarker(settings: JobLogSettings): string {
  return `[log truncated: limit of ${settings.maxLines} lines or ${settings.maxBytes / BYTES_PER_KB} KB reached, later lines dropped]`;
}

export type JobLog = {
  /** The lines kept so far; settle writers store this array as the Job's `logs`. */
  readonly lines: string[];
  /** A Cap's or stage's line: cut to {@link JOB_LOG_MAX_LINE_CHARS}, dropped once the log is bound. */
  readonly log: (message: string) => void;
  /** An outcome line (why the run ended): always kept, so a truncated log still says how it ended. */
  readonly outcome: (message: string) => void;
  /** True once the bound dropped lines and the marker was added. */
  readonly truncated: () => boolean;
  /** Lines added since the last {@link JobLog.markSaved}. */
  readonly unsaved: () => number;
  /** Record that the first `count` lines are stored. */
  readonly markSaved: (count: number) => void;
};

/**
 * A line Postgres can store in `jsonb`: no NUL and no lone surrogate (both are refused, which
 * would fail every save of the Job), cut at a character boundary.
 */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu;

function cutLine(message: string): string {
  const clean = message
    .replaceAll("\0", "")
    .replaceAll(LONE_SURROGATE, "\uFFFD");
  if (clean.length <= JOB_LOG_MAX_LINE_CHARS) return clean;
  const last = clean.codePointAt(JOB_LOG_MAX_LINE_CHARS - 1) ?? 0;
  const end =
    last > 0xff_ff ? JOB_LOG_MAX_LINE_CHARS - 1 : JOB_LOG_MAX_LINE_CHARS;
  return `${clean.slice(0, end)}…`;
}

/**
 * A Job's in-memory log with its bound (lines and bytes). `initial` is a reclaimed attempt's
 * stored lines; they count toward the bound.
 */
export function createJobLog(
  initial: readonly string[] = [],
  settings: JobLogSettings = jobLogSettings()
): JobLog {
  const lines = [...initial];
  const marker = jobLogTruncationMarker(settings);
  let bytes = lines.reduce((sum, line) => sum + Buffer.byteLength(line), 0);
  let saved = lines.length;
  let truncated = lines.includes(marker);
  return {
    lines,
    log(message) {
      if (truncated) return;
      const line = cutLine(message);
      const lineBytes = Buffer.byteLength(line);
      // One line of headroom for the marker.
      if (
        lines.length + 1 >= settings.maxLines ||
        bytes + lineBytes > settings.maxBytes
      ) {
        truncated = true;
        lines.push(marker);
        return;
      }
      bytes += lineBytes;
      lines.push(line);
    },
    outcome(message) {
      const line = cutLine(message);
      bytes += Buffer.byteLength(line);
      lines.push(line);
    },
    truncated: () => truncated,
    unsaved: () => lines.length - saved,
    markSaved(count) {
      saved = Math.max(saved, Math.min(count, lines.length));
    },
  };
}

type LoggedJob = Pick<
  JobRow,
  "id" | "caseId" | "actorId" | "actorLabel" | "playbookRunId"
>;

/**
 * Save the lines logged since the last save and tell open Job pages: one transaction writes the
 * Job's `logs` and appends the `job.logged` activity entry (the trigger notifies at commit).
 * Nothing unsaved is no write. The Job's status is not read or moved, so the final save after a
 * cancel from another process still lands.
 */
export function flushJobLogEffect(
  job: LoggedJob,
  jobLog: JobLog
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* flushJobLogGen() {
    if (jobLog.unsaved() === 0) return;
    const snapshot = [...jobLog.lines];
    const stored = yield* transact((tx) =>
      Effect.gen(function* writeLogsGen() {
        const row = yield* jobsRepoFx.updateInCase(tx, job.caseId, job.id, {
          logs: snapshot,
        });
        if (row === null) return false;
        yield* appendJobLogActivityEffect(tx, job, snapshot.length);
        return true;
      })
    );
    if (stored) jobLog.markSaved(snapshot.length);
  });
}

/** A save that never fails the Job: the settle carries every line too, so a miss only delays them. */
function flushQuietlyEffect(
  job: LoggedJob,
  jobLog: JobLog
): Effect.Effect<void, never, Db> {
  return flushJobLogEffect(job, jobLog).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        logSwallowed("job.log_flush", error);
      })
    ),
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        if (!Cause.hasInterruptsOnly(cause)) {
          logSwallowed("job.log_flush", Cause.squash(cause));
        }
      })
    )
  );
}

/**
 * Run a Job's body while a child fiber saves its new log lines every `flushMs`. Whatever way
 * the body ends (a finish, a failure, a defect, an interrupt from a cancel or a timeout), the
 * child is stopped and one last save runs before the caller's settle, so the lines a Cap logged
 * are stored even when the Job is cancelled from elsewhere.
 */
export function withLogFlusher<A, E, R>(
  job: LoggedJob,
  jobLog: JobLog,
  body: Effect.Effect<A, E, R>,
  flushMs: number = jobLogSettings().flushMs
): Effect.Effect<A, E, R | Db> {
  return Effect.gen(function* withLogFlusherGen() {
    const loop = yield* Effect.forkChild(
      Effect.sleep(flushMs).pipe(
        Effect.andThen(flushQuietlyEffect(job, jobLog)),
        Effect.forever
      )
    );
    return yield* body.pipe(
      Effect.ensuring(
        Fiber.interrupt(loop).pipe(
          Effect.andThen(flushQuietlyEffect(job, jobLog))
        )
      )
    );
  });
}
