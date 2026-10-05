import { createHash } from "node:crypto";

import { DateTime, Effect } from "effect";

import { capCacheRepo, type JobArtifact } from "@watchdog/db";
import { normalizeJobInput } from "@watchdog/schemas/jobs";
import {
  isJsonObject,
  trimmedOrNull,
  type CaseId,
} from "@watchdog/schemas/shared";

import { nowDateEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
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

export function lookupCapCacheEffect(input: {
  caseId: CaseId;
  capabilityId: string;
  inputHash: string;
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
    return yield* tryDbWith((exec) =>
      capCacheRepo.lookupActive(
        exec,
        input.caseId,
        input.capabilityId,
        input.inputHash,
        now
      )
    );
  });
}

interface StoreCapCacheInput {
  caseId: CaseId;
  capabilityId: string;
  inputHash: string;
  jobId: string;
  artifacts: JobArtifact[];
  resultSummary: string | null;
  ttlMs: number;
}

export function storeCapCacheEffect(
  input: StoreCapCacheInput
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* storeCapCacheGen() {
    const nowUtc = yield* DateTime.now;
    const now = DateTime.toDate(nowUtc);
    const expiresAt = DateTime.toDate(
      DateTime.add(nowUtc, { milliseconds: input.ttlMs })
    );
    yield* tryDbWith((exec) =>
      capCacheRepo.upsert(exec, {
        caseId: input.caseId,
        capabilityId: input.capabilityId,
        inputHash: input.inputHash,
        jobId: input.jobId,
        artifacts: input.artifacts,
        resultSummary: trimmedOrNull(input.resultSummary),
        ttlMs: input.ttlMs,
        createdAt: now,
        expiresAt,
      })
    );
  });
}
