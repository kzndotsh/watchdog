import { Cause, Effect, Option } from "effect";

import {
  providerCallsRepo,
  type DbExec,
  type NewProviderCall,
  type NewProviderCallOutcome,
  type StoredHop,
} from "@watchdog/db";
import type { CaseId, ProviderCallOutcome } from "@watchdog/schemas/shared";
import type { BodyRecord, ProviderCall } from "@watchdog/tools/http";

import { uploadArtifactEffect } from "../infra/blob";
import type { BlobStore } from "../infra/blob-store";
import { nowDateEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { logSwallowed } from "../infra/process-log";
import { jobsRepoFxDb, providerCallsRepoFxDb } from "../infra/repos-fx";
import { InternalError, type DomainTag } from "../infra/tagged-errors";

/**
 * How long a failed or cancelled Job's provider calls get to be saved before it settles. A
 * stuck database or object store must not hold a stop open; what was not saved is flagged on
 * the Job (`provenance_state = incomplete`).
 */
export const PROVIDER_CALL_PERSIST_TIMEOUT_MS = 5000;

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
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.failCause(cause)
        : Effect.fail(
            new InternalError({
              reason: "Failed to save the provider calls",
              cause: Cause.squash(cause),
            })
          )
    )
  );
}

/** Says the Job's call record has a gap. Best effort: a failure is logged, never raised. */
export function flagProvenanceIncomplete(
  scope: ProviderCallScope
): Effect.Effect<void, never, Db> {
  return jobsRepoFxDb
    .updateInCase(scope.caseId, scope.jobId, {
      provenanceState: "incomplete",
    })
    .pipe(
      Effect.timeoutOption(PROVIDER_CALL_PERSIST_TIMEOUT_MS),
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          logSwallowed("job.provenance_incomplete", Cause.squash(cause), {
            jobId: scope.jobId,
          });
          return Option.none();
        })
      ),
      Effect.asVoid
    );
}

/**
 * The failure and cancel path: saves what it can under a timeout and never fails or holds the
 * Job's stop. Whatever could not be saved, because the save failed or ran out of time, flags
 * the Job `incomplete`, so a short call list reads as a gap and not as "no calls".
 */
export function persistProviderCallsBestEffort(
  scope: ProviderCallScope,
  calls: () => readonly ProviderCall[],
  timeoutMs: number = PROVIDER_CALL_PERSIST_TIMEOUT_MS
): Effect.Effect<void, never, Db | BlobStore> {
  return Effect.suspend(() => persistProviderCallsEffect(scope, calls())).pipe(
    Effect.timeoutOption(timeoutMs),
    Effect.map((saved) => Option.isSome(saved)),
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logSwallowed("job.provider_calls_save", Cause.squash(cause), {
          jobId: scope.jobId,
        });
        return false;
      })
    ),
    Effect.flatMap((saved) =>
      saved ? Effect.void : flagProvenanceIncomplete(scope)
    )
  );
}
