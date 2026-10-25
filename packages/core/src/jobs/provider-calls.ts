import { Cause, Effect, Exit, Option } from "effect";

import {
  providerCallsRepo,
  type DbExec,
  type NewProviderCall,
  type NewProviderCallOutcome,
  type StoredHop,
} from "@watchdog/db";
import type {
  CaseId,
  ProviderCallOutcome,
  ProvenanceState,
} from "@watchdog/schemas/shared";
import {
  markCallsSaved,
  type BodyRecord,
  type ProviderCall,
} from "@watchdog/tools/http";

import { uploadArtifactEffect } from "../infra/blob";
import type { BlobStore } from "../infra/blob-store";
import { nowDateEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { logSwallowed } from "../infra/process-log";
import { providerCallsRepoFxDb } from "../infra/repos-fx";
import { InternalError, type DomainTag } from "../infra/tagged-errors";

/**
 * How long a failed or cancelled Job's provider calls get to be saved before it settles. A
 * stuck database or object store must not hold a stop open; what was not saved is flagged on
 * the Job (`provenance_state = incomplete`).
 */
const PROVIDER_CALL_PERSIST_TIMEOUT_MS = 5000;

/** The most one write of `provenance_state` is given, in a stop's budget or on the success path. */
const FLAG_BUDGET_MS = 1000;

/** Whose calls these are: one run (attempt) of one Job. */
export type ProviderCallScope = {
  readonly caseId: CaseId;
  readonly jobId: string;
  /** Names the attempt: a Job that runs again makes new calls under a new run id. */
  readonly runId: string;
};

/** The object name of a stored response body; its key is `{caseId}/{sha256}/provider-response`. */
const BODY_OBJECT_NAME = "provider-response";

/**
 * A response body is stored as opaque bytes. The provider's own content type is in the
 * outcome's allowlisted headers, never the object's: the body is served back only as an
 * attachment, never rendered.
 */
const BODY_MIME = "application/octet-stream";

function requestRow(
  scope: ProviderCallScope,
  call: ProviderCall
): NewProviderCall {
  const { requestBody } = call;
  return {
    id: call.id,
    caseId: scope.caseId,
    jobId: scope.jobId,
    runId: scope.runId,
    seq: call.seq,
    transport: call.transport,
    method: call.method,
    urlRedacted: call.url,
    bodyKind: call.bodyKind,
    requestBodyState: requestBody.state,
    requestBodySha256:
      requestBody.state === "hashed" ? requestBody.sha256 : null,
    requestBodyBytes: requestBody.state === "hashed" ? requestBody.bytes : null,
    startedAt: new Date(call.startedAt),
  };
}

/**
 * Write-ahead: the hook the Job's ledger awaits before a call is sent, so the request side is
 * stored first and a worker that dies mid-call still leaves its row (an action Cap's "we
 * submitted X" survives). A failure rejects, and the call is not sent: a call that cannot be
 * recorded is not made. The insert is idempotent.
 */
export function providerCallWriter(
  db: DbExec,
  scope: ProviderCallScope
): (call: ProviderCall) => Promise<void> {
  return async (call) => {
    await providerCallsRepo.insertRequest(db, requestRow(scope, call));
  };
}

const OUTCOMES: Record<ProviderCall["outcome"], ProviderCallOutcome> = {
  response: "response",
  failed: "failed",
  // The Job stopped while the call was in flight or its body was still being read.
  open: "unfinished",
  pending: "unfinished",
  served_from: "served_from",
};

type BodyFields = Pick<
  NewProviderCallOutcome,
  "bodyState" | "bodyReason" | "bodySha256" | "bodyBytes"
>;

function bodyFields(body: BodyRecord): BodyFields {
  switch (body.state) {
    case "none": {
      return {
        bodyState: "none",
        bodyReason: null,
        bodySha256: null,
        bodyBytes: null,
      };
    }
    case "stored": {
      return {
        bodyState: "stored",
        bodyReason: null,
        bodySha256: body.sha256,
        bodyBytes: body.bytes,
      };
    }
    case "hashed": {
      return {
        bodyState: "hashed",
        bodyReason: body.reason,
        bodySha256: body.sha256,
        bodyBytes: body.bytes,
      };
    }
    case "partial": {
      return {
        bodyState: "partial",
        bodyReason: body.reason,
        bodySha256: body.sha256,
        bodyBytes: body.bytes,
      };
    }
    default: {
      return body satisfies never;
    }
  }
}

/** The bytes to keep in the object store, if the body has any. */
function keptBytes(body: BodyRecord): Uint8Array | null {
  if (body.state === "stored") return body.data;
  if (body.state === "partial" && body.data !== undefined) return body.data;
  return null;
}

function outcomeRow(
  scope: ProviderCallScope,
  call: ProviderCall,
  blobKey: string | null,
  now: Date
): NewProviderCallOutcome {
  const startedAt = new Date(call.startedAt);
  const hops: StoredHop[] = call.hops.map((hop) => ({
    url: hop.url,
    status: hop.status,
    attempts: hop.attempts,
  }));
  // A call still in flight when the Job stopped ends when it was saved.
  const endedAt =
    call.durationMs === null
      ? now
      : new Date(startedAt.getTime() + call.durationMs);
  return {
    callId: call.id,
    caseId: scope.caseId,
    outcome: OUTCOMES[call.outcome],
    status: call.status,
    hops,
    responseHeaders: { ...call.responseHeaders },
    startedAt,
    headersMs: call.headersMs === null ? null : Math.round(call.headersMs),
    durationMs: call.durationMs === null ? null : Math.round(call.durationMs),
    failureTag: call.failure?.tag ?? null,
    failureReason: call.failure?.reason ?? null,
    ...bodyFields(call.body),
    blobKey,
    servedFromCallId: call.servedFrom,
    endedAt,
  };
}

/** Stores the body, content-addressed under the Case's blob prefix; the key, or null for no body. */
function storeBody(
  scope: ProviderCallScope,
  body: BodyRecord
): Effect.Effect<string | null, DomainTag, BlobStore> {
  const bytes = keptBytes(body);
  if (bytes === null || body.state === "none" || body.state === "hashed") {
    return Effect.succeed(null);
  }
  return uploadArtifactEffect({
    caseId: scope.caseId,
    bytes,
    mime: BODY_MIME,
    name: BODY_OBJECT_NAME,
  }).pipe(
    // The hash the ledger took as the bytes passed must be the hash of the bytes stored.
    Effect.flatMap((uploaded) =>
      uploaded.sha256 === body.sha256
        ? Effect.succeed(uploaded.uri)
        : Effect.fail(
            new InternalError({ reason: "Failed to store a provider response" })
          )
    )
  );
}

function persistCall(
  scope: ProviderCallScope,
  call: ProviderCall
): Effect.Effect<void, DomainTag, Db | BlobStore> {
  return Effect.gen(function* persistCallGen() {
    const blobKey = yield* storeBody(scope, call.body);
    const now = yield* nowDateEffect;
    // The write-ahead insert normally ran already; this one covers a call whose hook did not.
    yield* providerCallsRepoFxDb.insertRequest(requestRow(scope, call));
    yield* providerCallsRepoFxDb.insertOutcome(
      outcomeRow(scope, call, blobKey, now)
    );
  });
}

/**
 * Saves how each call ended, and its raw body, to the database and the object store. The
 * success path runs this before Evidence lands and fails the Job when it fails: a result is
 * never kept without the record of how it was obtained. A failure is an `InternalError` with a
 * fixed message; the driver's error stays in its cause.
 */
export function persistProviderCallsEffect(
  scope: ProviderCallScope,
  calls: readonly ProviderCall[]
): Effect.Effect<void, DomainTag, Db | BlobStore> {
  return Effect.forEach(calls, (call) => persistCall(scope, call), {
    concurrency: 4,
    discard: true,
  }).pipe(
    // Only now may an in-process cache serve a Job from these calls.
    Effect.tap(() =>
      Effect.sync(() => {
        markCallsSaved(calls.map((call) => call.id));
      })
    ),
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterruptsOnly(cause),
      (cause) =>
        Effect.fail(
          new InternalError({
            reason: "Failed to save the provider calls",
            cause: Cause.squash(cause),
          })
        )
    )
  );
}

/**
 * Moves the Job's `provenance_state` under a timeout, in one conditional statement. True when
 * this call made the move (the Job was in `from`). A timeout or failure is false and logged,
 * never raised. A write that timed out on this side may still land later: that can only turn a
 * state into `incomplete` (`complete` is written only after a full save), the safe direction.
 */
function moveProvenance(
  scope: ProviderCallScope,
  from: ProvenanceState,
  to: ProvenanceState,
  timeoutMs: number
): Effect.Effect<boolean | "timeout", never, Db> {
  return providerCallsRepoFxDb
    .transitionJobProvenance(scope.caseId, scope.jobId, from, to)
    .pipe(
      Effect.timeoutOption(timeoutMs),
      Effect.map((moved) => (Option.isSome(moved) ? moved.value : "timeout")),
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          logSwallowed("job.provenance_write", Cause.squash(cause), {
            jobId: scope.jobId,
          });
          return "timeout" as const;
        })
      )
    );
}

/**
 * Runs `save` with the Job flagged `incomplete` first (#524). The order is what makes a false
 * `complete` impossible: `complete` is written only after `save` succeeded, and only back over
 * a flag this run itself set.
 *
 * 1. `complete` to `incomplete`, one conditional statement within `flagMs`. A row moved means
 *    the flag is this run's (`ours`). No row means the Job already had a gap (an earlier run's,
 *    or another writer's), which a full save does not mend. No answer in time is `unknown`.
 * 2. `save`.
 * 3. If the flag is `ours`, `incomplete` back to `complete`, within `flagMs`. If that write
 *    fails the Job stays `incomplete`: a false gap, never a false `complete`.
 * 4. Cleanup around steps 1 to 3: on any exit that is not success, including an interrupt
 *    anywhere (a cancel or timeout during the flag itself), the Job is flagged `incomplete`
 *    again unless step 1 is known to have landed. The cleanup is uninterruptible, bounded by
 *    `flagMs`, and a no-op if the Job is already `incomplete`.
 *
 * Beside `save` that is at most two `flagMs` slices: the cleanup and the write back exclude
 * each other.
 */
export function saveUnderFlag<A, E, R>(
  scope: ProviderCallScope,
  save: Effect.Effect<A, E, R>,
  flagMs: number = FLAG_BUDGET_MS
): Effect.Effect<A, E, R | Db> {
  return Effect.suspend(() => {
    // Set once step 1 is known to have landed; the cleanup reads it at exit.
    let landed = false;
    return Effect.gen(function* saveUnderFlagGen() {
      const flag = yield* moveProvenance(
        scope,
        "complete",
        "incomplete",
        flagMs
      );
      landed = flag !== "timeout";
      const saved = yield* save;
      if (flag === true) {
        yield* moveProvenance(scope, "incomplete", "complete", flagMs);
      }
      return saved;
    }).pipe(
      Effect.onExit((exit) =>
        Exit.isSuccess(exit) || landed
          ? Effect.void
          : Effect.asVoid(
              moveProvenance(scope, "complete", "incomplete", flagMs)
            )
      )
    );
  });
}

/**
 * The failure and cancel path: saves what it can under a timeout and never fails or holds the
 * Job's stop. The Job is flagged `incomplete` before anything is saved ({@link saveUnderFlag}),
 * so whatever could not be saved, because the save failed, ran out of time or was interrupted,
 * leaves a gap that reads as a gap and not as "no calls".
 */
export function persistProviderCallsBestEffort(
  scope: ProviderCallScope,
  calls: () => readonly ProviderCall[],
  timeoutMs: number = PROVIDER_CALL_PERSIST_TIMEOUT_MS
): Effect.Effect<void, never, Db | BlobStore> {
  // One budget for the whole tail: the flag, the save and the follow-up write (the retry or the
  // revert, never both) are `flagMs + saveMs + flagMs`, so a stuck store and a stuck database
  // together hold the stop for `timeoutMs`, not a multiple of it.
  const flagMs = Math.min(FLAG_BUDGET_MS, Math.floor(timeoutMs / 4));
  const saveMs = timeoutMs - 2 * flagMs;
  const save = (taken: readonly ProviderCall[]) =>
    persistProviderCallsEffect(scope, taken).pipe(
      Effect.timeoutOption(saveMs),
      Effect.flatMap((saved) =>
        Option.isSome(saved)
          ? Effect.void
          : Effect.fail(
              new InternalError({
                reason: "Timed out saving the provider calls",
              })
            )
      )
    );
  // The calls are taken at the stop, before the flag write: a call still in flight is saved as
  // it was cut short, not as whatever it became while the database answered.
  return Effect.sync(calls).pipe(
    Effect.flatMap((taken) => saveUnderFlag(scope, save(taken), flagMs)),
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logSwallowed("job.provider_calls_save", Cause.squash(cause), {
          jobId: scope.jobId,
        });
      })
    )
  );
}
