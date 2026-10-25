import { createHash } from "node:crypto";

import { DateTime, Effect } from "effect";
import type { z } from "zod";

import type { CapabilityDef, CapJobPolicy } from "@watchdog/caps/sdk";
import type { JobArtifact } from "@watchdog/db";
import { normalizeJobInput } from "@watchdog/schemas/jobs";
import {
  isJsonObject,
  trimmedOrNull,
  type CaseId,
} from "@watchdog/schemas/shared";

import { nowDateEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { capCacheRepoFxDb } from "../infra/repos-fx";
import type { DomainTag } from "../infra/tagged-errors";
import { isPlainRecord } from "./stages/helpers";

function sortedRecord(input: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = input[key];
  }
  return sorted;
}

function capInputForHash(input: unknown): unknown {
  return isJsonObject(input) ? normalizeJobInput(input) : input;
}

export function hashCapInput(input: unknown): string {
  const scoped = capInputForHash(input);
  const body = isPlainRecord(scoped)
    ? JSON.stringify(sortedRecord(scoped))
    : JSON.stringify(scoped);
  return createHash("sha256").update(body).digest("hex");
}

/** How long a Cap's result is reusable, and the hash of the input it is keyed by. */
export type CapCacheKey = { ttlMs: number; inputHash: string };

/** The cache key of a Cap run, or null when the Cap's result is not cached (an act Cap, no TTL). */
export function capCacheKey(
  cap: Pick<CapabilityDef<z.ZodType>, "kind">,
  policy: CapJobPolicy,
  input: unknown
): CapCacheKey | null {
  const ttlMs = policy.cacheTtlMs;
  if (cap.kind === "act" || ttlMs === undefined || ttlMs <= 0) return null;
  return { ttlMs, inputHash: hashCapInput(input) };
}

export function lookupCapCacheEffect(input: {
  caseId: CaseId;
  capabilityId: string;
  inputHash: string;
  /** The version the Job was claimed with: a row of any other version is a miss. */
  capVersion: string;
}): Effect.Effect<
  {
    artifacts: JobArtifact[];
    resultSummary: string | null;
    jobId: string | null;
    evidenceIds: string[];
  } | null,
  DomainTag,
  Db
> {
  return Effect.gen(function* lookupCapCacheGen() {
    const now = yield* nowDateEffect;
    return yield* capCacheRepoFxDb.lookupActive(
      input.caseId,
      input.capabilityId,
      input.inputHash,
      input.capVersion,
      now
    );
  });
}

type StoreCapCacheInput = {
  caseId: CaseId;
  capabilityId: string;
  inputHash: string;
  /** The producing Job's `cap_version`, never the running code's. */
  capVersion: string;
  jobId: string;
  artifacts: JobArtifact[];
  resultSummary: string | null;
  ttlMs: number;
};

export function storeCapCacheEffect(
  input: StoreCapCacheInput
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* storeCapCacheGen() {
    const nowUtc = yield* DateTime.now;
    const now = DateTime.toDate(nowUtc);
    const expiresAt = DateTime.toDate(
      DateTime.add(nowUtc, { milliseconds: input.ttlMs })
    );
    yield* capCacheRepoFxDb.upsert({
      caseId: input.caseId,
      capabilityId: input.capabilityId,
      inputHash: input.inputHash,
      capVersion: input.capVersion,
      jobId: input.jobId,
      artifacts: input.artifacts,
      resultSummary: trimmedOrNull(input.resultSummary),
      ttlMs: input.ttlMs,
      createdAt: now,
      expiresAt,
    });
  });
}
