import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Data, Effect } from "effect";

import type { CapContext } from "@watchdog/cap-sdk";
import { db, jobsRepo, type JobArtifact } from "@watchdog/db";
import type { EvidenceSnapshot } from "@watchdog/schemas";
import {
  MissingCredentialError,
  ValidationVendorError,
  toolsHttpClientLayer,
  type ToolsTag,
} from "@watchdog/tools";

import { packEvidenceSnapshotEffect } from "../../evidence/pack-evidence-snapshot";
import {
  readArtifactBytesEffect,
  uploadArtifactEffect,
} from "../../infra/blob";
import { errorMessage } from "../../infra/domain-error";
import { tryDb } from "../../infra/postgres-effect";
import { logSwallowed } from "../../infra/process-log";
import {
  domainMessageOf,
  NotFoundError,
  type DomainTag,
} from "../../infra/tagged-errors";
import { getCredentialEffect, hasCredentialEffect } from "../../infra/vault";
import { hashCapInput, lookupCapCacheEffect } from "../cap-cache";
import { artifactsHaveCapReport } from "../load-cap-report";
import { inputString, linkedEvidenceId, type JobLog } from "./helpers";
import type { PreflightState } from "./preflight";

export interface CollectRuntime {
  scratchDir: string;
  /** Fiber abort signal forwarded into Cap `ctx.signal`. */
  signal: AbortSignal;
  jobLog: JobLog;
  evidenceSnapshot: EvidenceSnapshot | undefined;
  linkedSource: string | undefined;
  cacheTtlMs: number | null;
  inputHash: string | null;
}

export interface CollectResult {
  artifacts: JobArtifact[];
  /** Evidence ids already known (reclaim / cache); land-evidence skipped when set. */
  evidenceIds: string[];
  fromCache: boolean;
  reclaim: boolean;
  runtime: CollectRuntime;
}

function packSnapshotIfNeededEffect(
  state: PreflightState,
  jobLog: JobLog
): Effect.Effect<EvidenceSnapshot | undefined, DomainTag> {
  if (state.policy.needsEvidenceSnapshot !== true) {
    const none: EvidenceSnapshot | undefined = undefined;
    return Effect.succeed(none);
  }
  const evidenceId = inputString(state.input, "evidenceId");
  if (evidenceId === undefined || evidenceId === "") {
    return Effect.die(
      new Error("jobPolicy.needsEvidenceSnapshot requires input.evidenceId")
    );
  }
  const entityId = inputString(state.input, "entityId");
  return packEvidenceSnapshotEffect({
    caseId: state.job.caseId,
    evidenceId,
    ...(entityId !== undefined && entityId !== "" ? { entityId } : {}),
  }).pipe(
    Effect.tap((snapshot) =>
      Effect.sync(() => {
        jobLog.log(`packed EvidenceSnapshot (${snapshot.text.length} chars)`);
      })
    )
  );
}

function vaultToTools(name: string) {
  return (error: DomainTag): ToolsTag => {
    if (error instanceof NotFoundError) {
      return new MissingCredentialError({ slot: name });
    }
    return new ValidationVendorError({ message: domainMessageOf(error) });
  };
}

function buildCapContext(
  state: PreflightState,
  runtime: CollectRuntime
): CapContext<unknown> {
  const { job, input, allowThirdPartyEgress } = state;
  return {
    input,
    caseId: job.caseId,
    jobId: state.jobId,
    signal: runtime.signal,
    scratchDir: runtime.scratchDir,
    log: runtime.jobLog.log,
    allowThirdPartyEgress,
    ...(runtime.evidenceSnapshot
      ? { evidenceSnapshot: runtime.evidenceSnapshot }
      : {}),
    getCredential(name: string) {
      return getCredentialEffect(job.actorId, name).pipe(
        Effect.mapError(vaultToTools(name))
      );
    },
    hasCredential(name: string) {
      return hasCredentialEffect(job.actorId, name).pipe(
        Effect.mapError(vaultToTools(name))
      );
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
        Effect.mapError(
          (error) => new ValidationVendorError({ message: error.reason })
        ),
        Effect.map((uploaded) => ({
          name: uploadInput.name ?? "artifact",
          mime: uploaded.mime,
          uri: uploaded.uri,
          sha256: uploaded.sha256,
        }))
      );
    },
    readArtifact(uri: string) {
      return readArtifactBytesEffect(uri).pipe(
        Effect.mapError(
          (error) => new ValidationVendorError({ message: error.reason })
        )
      );
    },
  };
}

class ScratchIOError extends Data.TaggedError("ScratchIOError")<{
  readonly reason: string;
}> {}

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
    try: async () => {
      await rm(scratchDir, { recursive: true, force: true });
    },
    catch: (cleanupError: unknown) => {
      logSwallowed("collect.scratch_cleanup", cleanupError, { jobId });
      return new ScratchIOError({ reason: "collect scratch cleanup failed" });
    },
  }).pipe(Effect.catch(() => Effect.void));
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
    fromCache: false,
    reclaim: true,
    runtime,
  };
}

function lookupCacheHitEffect(
  state: PreflightState,
  runtime: CollectRuntime,
  jobLog: JobLog
): Effect.Effect<CollectResult | null, DomainTag> {
  const { cacheTtlMs, inputHash } = runtime;
  if (cacheTtlMs === null || inputHash === null) {
    return Effect.succeed(null);
  }
  return Effect.gen(function* lookupCacheHitGen() {
    const hit = yield* lookupCapCacheEffect({
      caseId: state.job.caseId,
      capabilityId: state.cap.id,
      inputHash,
    });
    if (!hit) return null;
    if (state.cap.interpret && !artifactsHaveCapReport(hit.artifacts)) {
      jobLog.log(
        "cache hit skipped — artifacts missing report.json (stale cache)"
      );
      return null;
    }
    const artifacts = hit.artifacts;
    const evidenceIds = [...(hit.evidenceIds ?? [])];
    jobLog.log(
      `cache hit (ttl=${cacheTtlMs}ms) — reusing artifacts from prior Job${
        hit.jobId === null ? "" : ` ${hit.jobId}`
      }`
    );
    yield* tryDb(() =>
      jobsRepo.update(db, state.jobId, {
        output: artifacts,
        evidenceIds,
        logs: jobLog.lines,
      })
    );
    return {
      artifacts,
      evidenceIds,
      fromCache: true,
      reclaim: false,
      runtime,
    } satisfies CollectResult;
  });
}

function runCapCollectEffect(
  state: PreflightState,
  runtime: CollectRuntime
): Effect.Effect<CollectResult, ToolsTag> {
  return Effect.gen(function* runCapCollectGen() {
    const ctx = buildCapContext(state, runtime);
    const runResult = yield* state.cap.run(ctx);
    return {
      artifacts: runResult.artifacts,
      evidenceIds: [] as string[],
      fromCache: false,
      reclaim: false,
      runtime,
    } satisfies CollectResult;
  }).pipe(Effect.provide(toolsHttpClientLayer));
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
): Effect.Effect<CollectResult, DomainTag | ToolsTag> {
  return Effect.gen(function* collectSetup() {
    const evidenceSnapshot = yield* packSnapshotIfNeededEffect(state, jobLog);
    const linkedSource = linkedEvidenceId(
      state.input,
      state.policy.linkEvidenceFromInput
    );
    const cacheTtlMs =
      state.cap.kind !== "act" &&
      state.policy.cacheTtlMs !== undefined &&
      state.policy.cacheTtlMs > 0
        ? state.policy.cacheTtlMs
        : null;
    const inputHash = cacheTtlMs === null ? null : hashCapInput(state.input);
    const scratchDir = yield* acquireScratchEffect();

    const runtime: CollectRuntime = {
      scratchDir,
      signal: jobSignal,
      jobLog,
      evidenceSnapshot,
      linkedSource,
      cacheTtlMs,
      inputHash,
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
