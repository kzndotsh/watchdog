import { Effect } from "effect";

import { parseGraphUuidList, parseTrimmedCaseId } from "@watchdog/schemas";

import type { DomainTag } from "../../infra/tagged-errors";
import { setJobStatusEffect } from "../set-job-status";

export function isPlainRecord(
  value: unknown
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function inputString(data: unknown, key: string): string | undefined {
  if (!isPlainRecord(data)) return undefined;
  const v = data[key];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function inputGraphUuid(data: unknown, key: string): string | undefined {
  const v = inputString(data, key);
  if (v === undefined) return undefined;
  return parseTrimmedCaseId(v) ?? undefined;
}

/**
 * Optional graph UUID with invalid-present detection.
 * `undefined` = absent/blank; `null` = present but not a UUID; string = valid.
 */
export function inputGraphUuidStrict(
  data: unknown,
  key: string
): string | undefined | null {
  const raw = inputString(data, key);
  if (raw === undefined) return undefined;
  return parseTrimmedCaseId(raw) ?? null;
}

export function linkedEvidenceId(
  data: unknown,
  fields: readonly ("evidenceId" | "sourceEvidenceId")[] | undefined
): string | undefined {
  if (fields === undefined || fields.length === 0) return undefined;
  for (const key of fields) {
    const v = inputString(data, key);
    if (v === undefined) continue;
    const parsed = parseTrimmedCaseId(v);
    if (parsed !== null) return parsed;
  }
  return undefined;
}

/**
 * Like {@link linkedEvidenceId} but returns `null` when a linked field is
 * present yet not a UUID (`undefined` = absent across all fields).
 */
export function linkedEvidenceIdStrict(
  data: unknown,
  fields: readonly ("evidenceId" | "sourceEvidenceId")[] | undefined
): string | undefined | null {
  if (fields === undefined || fields.length === 0) return undefined;
  for (const key of fields) {
    const v = inputString(data, key);
    if (v === undefined) continue;
    const parsed = parseTrimmedCaseId(v);
    return parsed ?? null;
  }
  return undefined;
}

export type StoredJobEvidenceIds =
  | { ok: true; ids: string[] }
  | { ok: false; reason: "invalid" };

/** Parse stored job.evidence_ids fail-closed (invalid non-empty → invalid). */
export function parseStoredJobEvidenceIds(
  ids: readonly string[] | null | undefined
): StoredJobEvidenceIds {
  const raw = ids ?? [];
  const parsed = parseGraphUuidList(raw);
  if (parsed !== null) return { ok: true, ids: parsed };
  const hasNonEmpty = raw.some(
    (id) => typeof id === "string" && id.trim() !== ""
  );
  if (hasNonEmpty) return { ok: false, reason: "invalid" };
  return { ok: true, ids: [] };
}

/** Reclaim/cache reuse: drop invalid stored ids instead of linking a partial set. */
export function jobEvidenceIdsForReuse(
  ids: readonly string[] | null | undefined
): string[] {
  const parsed = parseStoredJobEvidenceIds(ids);
  return parsed.ok ? parsed.ids : [];
}

export interface JobLog {
  lines: string[];
  log: (message: string) => void;
}

export function createJobLog(initial: string[] = []): JobLog {
  const lines = [...initial];
  return {
    lines,
    log: (message: string) => {
      lines.push(message);
    },
  };
}

export function failJobEffect(
  jobId: string,
  error: string,
  opts: { caseId: string },
  logs: string[] = []
): Effect.Effect<void, DomainTag> {
  return setJobStatusEffect(
    jobId,
    {
      status: "failed",
      error,
      logs,
      finishedAt: new Date(),
    },
    { unlessCancelled: true, notify: true, caseId: opts.caseId }
  ).pipe(Effect.asVoid);
}
