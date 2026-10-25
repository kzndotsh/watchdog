import { Effect } from "effect";

import type { ProviderCallWithOutcome } from "@watchdog/db";
import type {
  CaseId,
  OrganizationId,
  ProvenanceState,
  ProviderBodyKind,
  ProviderBodyReason,
  ProviderBodyState,
  ProviderCallOutcome,
  ProviderCallTransport,
  ProviderRequestBodyState,
} from "@watchdog/schemas/shared";

import {
  assertCaseInOrgEffect,
  requireTrimmedGraphId,
} from "../graph/patch/guards";
import { readArtifactBytesEffect, sha256Hex } from "../infra/blob";
import type { BlobStore } from "../infra/blob-store";
import type { Db } from "../infra/db-service";
import {
  evidenceRepoFxDb,
  jobsRepoFxDb,
  providerCallsRepoFxDb,
} from "../infra/repos-fx";
import {
  InternalError,
  NotFoundError,
  boundEchoedId,
  type DomainTag,
} from "../infra/tagged-errors";

/** Most calls a read returns. A Job makes a handful; a longer list is cut and says so. */
export const PROVIDER_CALL_LIST_MAX = 200;

/** What the call's recorded body is and what was kept of it. */
export type ProviderCallBody = {
  kind: ProviderBodyKind;
  state: ProviderBodyState;
  reason: ProviderBodyReason | null;
  sha256: string | null;
  bytes: number | null;
  /** The provider's own `Content-Type` (from the recorded headers); never the served type. */
  contentType: string | null;
  /** The raw response is stored and can be downloaded as an attachment. */
  isDownloadable: boolean;
};

export type ProviderCallRequestBody = {
  state: ProviderRequestBodyState;
  sha256: string | null;
  bytes: number | null;
};

/** The call a cache answered for, when it is a call of the caller's own Case. */
export type ProviderCallOriginal = { callId: string; jobId: string };

export type ProviderCallRecord = {
  id: string;
  jobId: string;
  capabilityId: string;
  /** The Cap's code fingerprint when the Job ran; null for a Job from before it was stamped. */
  capVersion: string | null;
  transport: ProviderCallTransport;
  method: string;
  /** Redacted when it was recorded. Shown as text, never followed. */
  url: string;
  startedAt: string;
  /** Null when no outcome was recorded (the worker died mid-call, or the save was lost). */
  outcome: ProviderCallOutcome | null;
  status: number | null;
  hops: number;
  headersMs: number | null;
  durationMs: number | null;
  failureTag: string | null;
  failureReason: string | null;
  requestBody: ProviderCallRequestBody;
  /** Null while there is no outcome. */
  body: ProviderCallBody | null;
  /** An in-process cache answered; no request went to the provider. */
  isServedFromCache: boolean;
  /**
   * The original call of a cache answer, only when it belongs to this Case. Outside the Case
   * (the caches are shared by the process) it is null and nothing about it is read.
   */
  original: ProviderCallOriginal | null;
};

/** A Job (or the Jobs behind one Evidence row) that reused a cached result. */
export type ProviderCallCacheHit = {
  jobId: string;
  /** The Job the cached result came from, only when it is a Job of this Case; else null. */
  sourceJobId: string | null;
};

export type ProviderCallList = {
  /** `incomplete` says calls or outcomes were lost: an empty or short list is then a gap. */
  provenance: ProvenanceState;
  calls: ProviderCallRecord[];
  /** More calls exist than `PROVIDER_CALL_LIST_MAX`. */
  isTruncated: boolean;
  cacheHits: ProviderCallCacheHit[];
  /** More cache-hit Jobs exist than `PROVIDER_CALL_LIST_MAX`. */
  areCacheHitsTruncated: boolean;
};

function contentTypeOf(headers: Record<string, string>): string | null {
  const value = headers["content-type"];
  return value === undefined || value === "" ? null : value;
}

function toBody(
  call: ProviderCallWithOutcome["call"],
  outcome: NonNullable<ProviderCallWithOutcome["outcome"]>
): ProviderCallBody {
  return {
    kind: call.bodyKind,
    state: outcome.bodyState,
    reason: outcome.bodyReason,
    sha256: outcome.bodySha256,
    bytes: outcome.bodyBytes,
    contentType: contentTypeOf(outcome.responseHeaders),
    isDownloadable: outcome.bodyState === "stored" && outcome.blobKey !== null,
  };
}

function toRecord(
  { call, outcome, job }: ProviderCallWithOutcome,
  originals: ReadonlyMap<string, string>
): ProviderCallRecord {
  const servedFromId = outcome?.servedFromCallId ?? null;
  const originalJobId =
    servedFromId === null ? undefined : originals.get(servedFromId);
  return {
    id: call.id,
    jobId: call.jobId,
    capabilityId: job.capabilityId,
    capVersion: job.capVersion,
    transport: call.transport,
    method: call.method,
    url: call.urlRedacted,
    startedAt: call.startedAt.toISOString(),
    outcome: outcome?.outcome ?? null,
    status: outcome?.status ?? null,
    hops: outcome?.hops.length ?? 0,
    headersMs: outcome?.headersMs ?? null,
    durationMs: outcome?.durationMs ?? null,
    failureTag: outcome?.failureTag ?? null,
    failureReason: outcome?.failureReason ?? null,
    requestBody: {
      state: call.requestBodyState,
      sha256: call.requestBodySha256,
      bytes: call.requestBodyBytes,
    },
    body: outcome === null ? null : toBody(call, outcome),
    isServedFromCache: outcome?.outcome === "served_from",
    original:
      servedFromId === null || originalJobId === undefined
        ? null
        : { callId: servedFromId, jobId: originalJobId },
  };
}

/**
 * Follow `served_from_call_id` only inside the Case. The id is a soft reference that can name a
 * call of another Case or organization, so the lookup is `case_id = $caseId`: a call outside the
 * Case is absent, and the record says "served from cache" with no original.
 */
function resolveOriginals(
  caseId: CaseId,
  rows: readonly ProviderCallWithOutcome[]
): Effect.Effect<Map<string, string>, DomainTag, Db> {
  return Effect.gen(function* resolveOriginalsGen() {
    const ids = rows.flatMap(({ outcome }) => {
      const id = outcome?.servedFromCallId;
      return typeof id === "string" ? [id] : [];
    });
    const found = yield* providerCallsRepoFxDb.findIdsInCase(caseId, ids);
    return new Map(found.map(({ id, jobId }) => [id, jobId]));
  });
}

/**
 * The records of calls already read from one Case, with `served_from_call_id` followed only
 * inside that Case (the Export's envelopes use this: the same records the read surfaces show).
 */
export function toProviderCallRecordsEffect(
  caseId: CaseId,
  rows: readonly ProviderCallWithOutcome[]
): Effect.Effect<ProviderCallRecord[], DomainTag, Db> {
  return Effect.gen(function* toProviderCallRecordsGen() {
    const originals = yield* resolveOriginals(caseId, rows);
    return rows.map((row) => toRecord(row, originals));
  });
}

function toList(input: {
  rows: ProviderCallWithOutcome[];
  originals: ReadonlyMap<string, string>;
  hasGap: boolean;
  cacheHits: ProviderCallCacheHit[];
}): ProviderCallList {
  const shown = input.rows.slice(0, PROVIDER_CALL_LIST_MAX);
  return {
    // From the Jobs themselves, never from the rows shown: a Job past the cut still counts.
    provenance: input.hasGap ? "incomplete" : "complete",
    calls: shown.map((row) => toRecord(row, input.originals)),
    isTruncated: input.rows.length > PROVIDER_CALL_LIST_MAX,
    cacheHits: input.cacheHits.slice(0, PROVIDER_CALL_LIST_MAX),
    areCacheHitsTruncated: input.cacheHits.length > PROVIDER_CALL_LIST_MAX,
  };
}

/**
 * The provider calls a Job made, with how each ended. The Job must be in the caller's
 * organization's Case; a Job of another Case or organization is `NotFoundError`.
 */
export function listJobProviderCallsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  jobId: string
): Effect.Effect<ProviderCallList, DomainTag, Db> {
  return Effect.gen(function* listJobProviderCallsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedJobId = yield* requireTrimmedGraphId(jobId, "Job");
    const job = yield* jobsRepoFxDb.getInCase(scopedCaseId, normalizedJobId);
    if (!job) {
      return yield* new NotFoundError({ entity: "Job", id: normalizedJobId });
    }
    const rows = yield* providerCallsRepoFxDb.listForJob(
      scopedCaseId,
      normalizedJobId,
      PROVIDER_CALL_LIST_MAX + 1
    );
    const originals = yield* resolveOriginals(scopedCaseId, rows);
    const cacheHits = yield* providerCallsRepoFxDb.listCacheHits(
      scopedCaseId,
      {
        jobId: normalizedJobId,
      },
      PROVIDER_CALL_LIST_MAX + 1
    );
    return toList({
      rows,
      originals,
      hasGap: job.job.provenanceState === "incomplete",
      cacheHits,
    });
  });
}

/**
 * The provider calls behind one Evidence row: the calls of the run that produced it, or of the
 * run its cached result came from. Evidence of another Case or organization is `NotFoundError`.
 */
export function listEvidenceProviderCallsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  evidenceId: string
): Effect.Effect<ProviderCallList, DomainTag, Db> {
  return Effect.gen(function* listEvidenceProviderCallsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEvidenceId = yield* requireTrimmedGraphId(
      evidenceId,
      "Evidence"
    );
    const evidence = yield* evidenceRepoFxDb.getUriInCaseIncludingDeleted(
      scopedCaseId,
      normalizedEvidenceId
    );
    if (!evidence) {
      return yield* new NotFoundError({
        entity: "Evidence",
        id: normalizedEvidenceId,
      });
    }
    const rows = yield* providerCallsRepoFxDb.listForEvidence(
      scopedCaseId,
      normalizedEvidenceId,
      PROVIDER_CALL_LIST_MAX + 1
    );
    const originals = yield* resolveOriginals(scopedCaseId, rows);
    const hasGap = yield* providerCallsRepoFxDb.evidenceHasIncompleteProvenance(
      scopedCaseId,
      normalizedEvidenceId
    );
    const cacheHits = yield* providerCallsRepoFxDb.listCacheHits(
      scopedCaseId,
      {
        evidenceId: normalizedEvidenceId,
      },
      PROVIDER_CALL_LIST_MAX + 1
    );
    return toList({ rows, originals, hasGap, cacheHits });
  });
}

/** A stored raw response, ready to be served as an attachment. */
export type ProviderCallResponse = {
  bytes: Uint8Array;
  sha256: string;
  /** The provider's `Content-Type`, for the record; never used to serve the bytes. */
  providerContentType: string | null;
};

/**
 * The stored body of a call already read from `caseId`, checked as `getProviderCallResponseEffect`
 * checks it (the Case's blob prefix, the recorded size, the recorded SHA-256). A call with no
 * stored body is `NotFoundError` (`echoedId` names it); a body that no longer matches is an
 * `InternalError`. The Export reads bodies through this, so it ships only verified bytes.
 */
export function readStoredResponseEffect(
  caseId: CaseId,
  { outcome }: Pick<ProviderCallWithOutcome, "outcome">,
  echoedId: string
): Effect.Effect<ProviderCallResponse, DomainTag, BlobStore> {
  return Effect.gen(function* readStoredResponseGen() {
    if (
      !outcome ||
      outcome.bodyState !== "stored" ||
      outcome.blobKey === null ||
      // A stored body lives under its Case's prefix; a key outside it is never read.
      !outcome.blobKey.startsWith(`${caseId}/`) ||
      outcome.bodySha256 === null ||
      outcome.bodyBytes === null
    ) {
      return yield* new NotFoundError({
        entity: "Provider call",
        id: boundEchoedId(echoedId),
      });
    }
    const { blobKey, bodySha256, bodyBytes } = outcome;
    const bytes = yield* readArtifactBytesEffect(blobKey, {
      maxBytes: bodyBytes,
      reason: "The stored response is larger than recorded",
    }).pipe(
      // The recorded size is the server's own record: a body past it is a server fault.
      Effect.catchTag("InvalidError", (error) =>
        Effect.fail(
          new InternalError({
            reason: "Failed to read the response",
            cause: error,
          })
        )
      )
    );
    if (sha256Hex(bytes) !== bodySha256) {
      return yield* new InternalError({
        reason: "Failed to read the response",
        cause: new Error(`Stored response does not match its hash: ${blobKey}`),
      });
    }
    return {
      bytes,
      sha256: bodySha256,
      providerContentType: contentTypeOf(outcome.responseHeaders),
    };
  });
}

/**
 * The raw response of a call whose body is stored. A call of another Case or organization, a
 * call with no stored body and an unknown id are all the same `NotFoundError`. The bytes are read
 * against the recorded size and checked against the recorded SHA-256: a stored body that no
 * longer matches is an `InternalError`, never served.
 */
export function getProviderCallResponseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  callId: string
): Effect.Effect<ProviderCallResponse, DomainTag, Db | BlobStore> {
  return Effect.gen(function* getProviderCallResponseGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedCallId = yield* requireTrimmedGraphId(
      callId,
      "Provider call"
    );
    const row = yield* providerCallsRepoFxDb.getInCase(
      scopedCaseId,
      normalizedCallId
    );
    if (!row) {
      return yield* new NotFoundError({
        entity: "Provider call",
        id: boundEchoedId(callId),
      });
    }
    return yield* readStoredResponseEffect(scopedCaseId, row, callId);
  });
}
