import { createHash } from "node:crypto";

import { capCacheRepo, db, type JobArtifact } from "@watchdog/db";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sortedRecord(input: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = input[key];
  }
  return sorted;
}

export function hashCapInput(input: unknown): string {
  const body = isPlainRecord(input)
    ? JSON.stringify(sortedRecord(input))
    : JSON.stringify(input);
  return createHash("sha256").update(body).digest("hex");
}

export function lookupCapCache(input: {
  caseId: string;
  capabilityId: string;
  inputHash: string;
}): Promise<{
  artifacts: JobArtifact[];
  resultSummary: string | null;
  jobId: string | null;
  evidenceIds: string[];
} | null> {
  return capCacheRepo.lookupActive(
    db,
    input.caseId,
    input.capabilityId,
    input.inputHash,
    new Date()
  );
}

interface StoreCapCacheInput {
  caseId: string;
  capabilityId: string;
  inputHash: string;
  jobId: string;
  artifacts: JobArtifact[];
  resultSummary: string | null;
  ttlMs: number;
}

export async function storeCapCache(input: StoreCapCacheInput): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.ttlMs);
  await capCacheRepo.upsert(db, {
    caseId: input.caseId,
    capabilityId: input.capabilityId,
    inputHash: input.inputHash,
    jobId: input.jobId,
    artifacts: input.artifacts,
    resultSummary: input.resultSummary,
    ttlMs: input.ttlMs,
    createdAt: now,
    expiresAt,
  });
}
