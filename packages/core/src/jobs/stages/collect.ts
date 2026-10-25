import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Data, Effect, Exit } from "effect";

import { isSecretCredential } from "@watchdog/caps";
import {
  capBodyPolicy,
  type ArtifactReadLimit,
  type CapContext,
} from "@watchdog/caps/sdk";
import type { JobArtifact } from "@watchdog/db";
import type { EvidenceSnapshot } from "@watchdog/schemas/evidence";
import {
  MissingCredentialError,
  ValidationVendorError,
  type ToolsTag,
} from "@watchdog/tools/errors";
import {
  Egress,
  egressPolicyFor,
  httpClientLayer,
  makeJobEgress,
  OutboundClient,
  type EgressLedger,
} from "@watchdog/tools/http";

import { credentialModeOfVersion } from "../../caps/breach-caps";
import { packEvidenceSnapshotEffect } from "../../evidence/pack-evidence-snapshot";
import {
  readArtifactBytesEffect,
  uploadArtifactEffect,
} from "../../infra/blob";
import { BlobStore, type BlobStoreApi } from "../../infra/blob-store";
import { instanceCredentialFingerprint } from "../../infra/credential-fingerprint";
import { Db } from "../../infra/db-service";
import { errorMessage } from "../../infra/error-utils";
import { transact } from "../../infra/postgres-tx";
import { logSwallowed } from "../../infra/process-log";
import { jobsRepoFx } from "../../infra/repos-fx";
import {
  type InternalError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../../infra/tagged-errors";
import { Vault, type VaultApi } from "../../infra/vault";
import { toDomainTag } from "../../infra/vendor-errors";
import { aiPrivateOrigins } from "../ai-private-origins";
import { capCacheKey, lookupCapCacheEffect } from "../cap-cache";
import type { JobLog } from "../job-log";
import { artifactsHaveCapReport } from "../load-cap-report";
import {
  flagProvenanceIncomplete,
  persistProviderCallsBestEffort,
  persistProviderCallsEffect,
  providerCallWriter,
} from "../provider-calls";
import {
  inputGraphUuid,
  inputGraphUuidStrict,
  inputString,
  linkedEvidenceId,
} from "./helpers";
import type { PreflightState } from "./preflight";

export type CollectRuntime = {
  scratchDir: string;
  /** Fiber abort signal forwarded into Cap `ctx.signal`. */
  signal: AbortSignal;
  jobLog: JobLog;
  evidenceSnapshot: EvidenceSnapshot | undefined;
  linkedSource: string | undefined;
  cacheTtlMs: number | null;
  inputHash: string | null;
};

export type CollectResult = {
  artifacts: JobArtifact[];
  /** Evidence ids already known (reclaim / cache); land-evidence skipped when set. */
  evidenceIds: string[];
  fromCache: boolean;
  reclaim: boolean;
  /**
   * The calls this run made, saved before this result was returned: the Evidence it lands links
   * to them. Empty for a reclaim, a cache hit and a Cap that made no call.
   */
  providerCallIds: string[];
  /**
   * For a cache hit, the Job whose run the result came from: Evidence landed from the hit links
   * to that run's calls. Null when the result was not a hit, or the cache names no Job.
   */
  cacheSourceJobId: string | null;
  runtime: CollectRuntime;
};

function packSnapshotIfNeededEffect(
  state: PreflightState,
  jobLog: JobLog
): Effect.Effect<EvidenceSnapshot | undefined, DomainTag, Db | BlobStore> {
  if (state.policy.needsEvidenceSnapshot !== true) {
    const none: EvidenceSnapshot | undefined = undefined;
    return Effect.succeed(none);
  }
  const rawEvidence = inputGraphUuid(state.input, "evidenceId");
  if (rawEvidence === undefined) {
    const present = inputString(state.input, "evidenceId") !== undefined;
    return new InvalidError({
      reason: present
        ? "input.evidenceId must be a valid UUID"
        : "jobPolicy.needsEvidenceSnapshot requires input.evidenceId",
    });
  }
  const evidenceId = rawEvidence;
  const entityParsed = inputGraphUuidStrict(state.input, "entityId");
  if (entityParsed === null) {
    return new InvalidError({
      reason: "input.entityId must be a valid UUID",
    });
  }
  const entityId = entityParsed;
  return packEvidenceSnapshotEffect({
    caseId: state.job.caseId,
    evidenceId,
    ...(entityId === undefined ? {} : { entityId }),
  }).pipe(
    Effect.tap((snapshot) =>
      Effect.sync(() => {
        jobLog.log(`packed EvidenceSnapshot (${snapshot.text.length} chars)`);
      })
    )
  );
}

/**
 * What a Cap sees of a blob failure: the error's own `reason`, which is fixed text either way
 * (the caller-input limit sentence from the Cap, or `Failed to <what>` for a storage failure,
 * whose driver message stays in the `InternalError` cause and the logs).
 */
export function blobToVendorError(
  error: InvalidError | InternalError
): ValidationVendorError {
  return new ValidationVendorError({ message: error.reason, cause: error });
}

function vaultToTools(name: string) {
  return (error: DomainTag): ToolsTag => {
    if (error instanceof NotFoundError) {
      return new MissingCredentialError({ slot: name });
    }
    return new ValidationVendorError({ message: error.message });
  };
}

/**
 * Cap contexts carry R = never, so the services their vault and blob helpers
 * need are captured by the caller and passed in.
 */
function buildCapContext(
  state: PreflightState,
  runtime: CollectRuntime,
  services: {
    vault: VaultApi;
    blob: BlobStoreApi;
    /** Told each secret credential value a Cap reads, so recorded URLs can hide it by value. */
    ledger: EgressLedger;
  }
): CapContext<unknown> {
  const { vault, blob, ledger } = services;
  const { job, input } = state;
  return {
    input,
    caseId: job.caseId,
    jobId: state.jobId,
    signal: runtime.signal,
    scratchDir: runtime.scratchDir,
    log: runtime.jobLog.log,
    // What a breach Cap keeps of credentials comes from the version the Job was stamped with
    // (the one its cache entry uses). The fingerprint key stays in this closure: the Cap gets
    // the function, not the key.
    breachCredentialMode: credentialModeOfVersion(state.capVersion),
    credentialFingerprint: instanceCredentialFingerprint(),
    ...(runtime.evidenceSnapshot
      ? { evidenceSnapshot: runtime.evidenceSnapshot }
      : {}),
    getCredential(name: string) {
      return vault.get(job.actorId, name).pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            if (isSecretCredential(name)) ledger.registerSecret(name, value);
          })
        ),
        Effect.mapError(vaultToTools(name))
      );
    },
    hasCredential(name: string) {
      return vault
        .has(job.actorId, name)
        .pipe(Effect.mapError(vaultToTools(name)));
    },
    uploadArtifact(uploadInput: {
      bytes: Uint8Array;
      mime: string;
      name?: string;
    }) {
      return uploadArtifactEffect({
        caseId: job.caseId,
        bytes: uploadInput.bytes,
        mime: uploadInput.mime,
        name: uploadInput.name,
      }).pipe(
        Effect.provideService(BlobStore, blob),
        Effect.mapError(blobToVendorError),
        Effect.map((uploaded) => ({
          name: uploadInput.name ?? "artifact",
          mime: uploaded.mime,
          uri: uploaded.uri,
          sha256: uploaded.sha256,
        }))
      );
    },
    readArtifact(uri: string, limit?: ArtifactReadLimit) {
      return readArtifactBytesEffect(uri, limit).pipe(
        Effect.provideService(BlobStore, blob),
        Effect.mapError(blobToVendorError)
      );
    },
  };
}

class ScratchIOError extends Data.TaggedError("ScratchIOError")<{
  readonly reason: string;
}> {
  readonly code = "scratch_io" as const;
}

function acquireScratchEffect(): Effect.Effect<string> {
  return Effect.tryPromise({
    try: () => mkdtemp(path.join(tmpdir(), "wd-cap-")),
    catch: (error) => new ScratchIOError({ reason: errorMessage(error) }),
  }).pipe(Effect.orDie);
}

function cleanupScratchEffect(
  scratchDir: string,
  jobId: string
): Effect.Effect<void> {
  return Effect.tryPromise({
    try: () => rm(scratchDir, { recursive: true, force: true }),
    catch: (cleanupError: unknown) => {
      logSwallowed("collect.scratch_cleanup", cleanupError, { jobId });
      return new ScratchIOError({ reason: "collect scratch cleanup failed" });
    },
  }).pipe(Effect.ignore);
}

function reclaimResult(
  state: PreflightState,
  runtime: CollectRuntime,
  jobLog: JobLog
): CollectResult {
  jobLog.log("reclaim: reusing existing Job artifacts");
  return {
    artifacts: state.reclaimArtifacts ?? [],
    evidenceIds: [...state.reclaimEvidenceIds],
    // A cache hit the dead worker had already stamped stays a hit: the replacement made no
    // calls either, so its result must not be filed in the cache as a run of its own.
    fromCache: state.job.cacheSourceJobId !== null,
    reclaim: true,
    providerCallIds: [],
    cacheSourceJobId: state.job.cacheSourceJobId,
    runtime,
  };
}

function lookupCacheHitEffect(
  state: PreflightState,
  runtime: CollectRuntime,
  jobLog: JobLog
): Effect.Effect<CollectResult | null, DomainTag, Db> {
  const { cacheTtlMs, inputHash } = runtime;
  if (cacheTtlMs === null || inputHash === null) {
    return Effect.succeed(null);
  }
  return Effect.gen(function* lookupCacheHitGen() {
    const hit = yield* lookupCapCacheEffect({
      caseId: state.job.caseId,
      capabilityId: state.cap.id,
      inputHash,
      capVersion: state.capVersion,
    });
    if (!hit) return null;
    if (state.cap.interpret && !artifactsHaveCapReport(hit.artifacts)) {
      jobLog.log(
        "cache hit skipped — artifacts missing report.json (stale cache)"
      );
      return null;
    }
    const artifacts = hit.artifacts;
    const evidenceIds = hit.evidenceIds;
    jobLog.log(
      `cache hit (ttl=${cacheTtlMs}ms) — reusing artifacts from prior Job${
        hit.jobId === null ? "" : ` ${hit.jobId}`
      }`
    );
    // One transaction: the artifacts, the Evidence links they cite and the run the result came
    // from commit together.
    yield* transact((tx) =>
      jobsRepoFx.updateInCase(tx, state.job.caseId, state.jobId, {
        output: artifacts,
        evidenceIds,
        logs: jobLog.lines,
        cacheSourceJobId: hit.jobId,
      })
    );
    return {
      artifacts,
      evidenceIds,
      fromCache: true,
      reclaim: false,
      providerCallIds: [],
      cacheSourceJobId: hit.jobId,
      runtime,
    } satisfies CollectResult;
  });
}

function runCapCollectEffect(
  state: PreflightState,
  runtime: CollectRuntime
): Effect.Effect<
  CollectResult,
  DomainTag,
  Db | BlobStore | Vault | OutboundClient
> {
  return Effect.gen(function* runCapCollectGen() {
    const vault = yield* Vault;
    const blob = yield* BlobStore;
    const outbound = yield* OutboundClient;
    const db = yield* Db;
    // This attempt's calls: a Job that runs again makes new ones under a new run id.
    const scope = {
      caseId: state.job.caseId,
      jobId: state.jobId,
      runId: randomUUID(),
    };
    const body = capBodyPolicy(state.cap);
    // One Egress per Job over the shared client: its ledger records every call the Cap makes
    // (HTTP, DNS, TLS and model calls), and the operator's private model origins are the only
    // private addresses a model call may reach. Each call's request side is stored before it
    // is sent (write-ahead), so a worker that dies mid-call still leaves its row.
    const { egress, ledger } = makeJobEgress(outbound, {
      privateAiOrigins: aiPrivateOrigins(),
      // The running Cap's contacts and the input's values: the Egress refuses what the Cap did
      // not declare, on every hop, and a download that is not its fixed request.
      policy: egressPolicyFor(state.cap.contacts, state.input),
      bodyPolicy: body.kind === "hash_only" ? "hash_only" : "keep",
      ...(body.kind === "keep" && body.maxBytes !== undefined
        ? { keep: { perCallBytes: body.maxBytes } }
        : {}),
      onCallStart: providerCallWriter(db, scope),
    });
    const ctx = buildCapContext(state, runtime, { vault, blob, ledger });
    const runResult = yield* state.cap.run(ctx).pipe(
      Effect.provide(httpClientLayer),
      Effect.provideService(Egress, egress),
      Effect.mapError(toDomainTag),
      // A failed or cancelled run saves what it can under a timeout; it never fails the stop.
      Effect.onExit((exit) =>
        Exit.isSuccess(exit)
          ? Effect.void
          : persistProviderCallsBestEffort(scope, () => ledger.drain())
      ),
      Effect.ensuring(
        Effect.sync(() => {
          const count = ledger.count();
          if (count > 0) {
            runtime.jobLog.log(`provider calls recorded: ${count}`);
          }
        })
      )
    );
    // Success: how each call ended, and its raw body, are saved before Evidence lands, and a
    // failure to save fails the Job, so a result never exists without its record.
    const calls = ledger.drain();
    yield* persistProviderCallsEffect(scope, calls).pipe(
      // A failed save or a stop (cancel, timeout) while saving leaves the record short: flag it.
      Effect.onExit((exit) =>
        Exit.isSuccess(exit) ? Effect.void : flagProvenanceIncomplete(scope)
      )
    );
    return {
      artifacts: runResult.artifacts,
      evidenceIds: [] as string[],
      fromCache: false,
      reclaim: false,
      providerCallIds: calls.map((call) => call.id),
      cacheSourceJobId: null,
      runtime,
    } satisfies CollectResult;
  });
}

/**
 * Pack snapshot, prepare scratch, then reclaim / cache-hit / Cap.run.
 * Does not insert Evidence rows (see land-evidence).
 * Timeout/cancel are fiber-scoped (`JobFibers` + `Effect.abortSignal`); Caps get that signal.
 */
export function collectEffect(
  state: PreflightState,
  jobLog: JobLog,
  jobSignal: AbortSignal
): Effect.Effect<
  CollectResult,
  DomainTag,
  Db | BlobStore | Vault | OutboundClient
> {
  return Effect.gen(function* collectSetup() {
    const evidenceSnapshot = yield* packSnapshotIfNeededEffect(state, jobLog);
    const linkedSource = linkedEvidenceId(
      state.input,
      state.policy.linkEvidenceFromInput
    );
    const cacheKey = capCacheKey(state.cap, state.policy, state.input);
    const scratchDir = yield* acquireScratchEffect();

    const runtime: CollectRuntime = {
      scratchDir,
      signal: jobSignal,
      jobLog,
      evidenceSnapshot,
      linkedSource,
      cacheTtlMs: cacheKey?.ttlMs ?? null,
      inputHash: cacheKey?.inputHash ?? null,
    };

    const body = Effect.gen(function* collectBody() {
      if (state.reclaimArtifacts) {
        return reclaimResult(state, runtime, jobLog);
      }
      const cached = yield* lookupCacheHitEffect(state, runtime, jobLog);
      if (cached !== null) return cached;
      return yield* runCapCollectEffect(state, runtime);
    });

    return yield* body.pipe(
      Effect.catchCause((cause) =>
        cleanupScratchEffect(scratchDir, state.jobId).pipe(
          Effect.andThen(Effect.failCause(cause))
        )
      )
    );
  });
}
