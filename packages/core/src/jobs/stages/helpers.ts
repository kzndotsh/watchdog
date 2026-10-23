import { Effect } from "effect";

import {
  parseTrimmedUuid,
  type CaseId,
  type JobStopCause,
} from "@watchdog/schemas/shared";

import { nowDateEffect } from "../../infra/clock";
import type { Db } from "../../infra/db-service";
import type { DomainTag } from "../../infra/tagged-errors";
import { settleJobEffect } from "../lifecycle/settle";

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
  return parseTrimmedUuid(v) ?? undefined;
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
  return parseTrimmedUuid(raw) ?? null;
}

export function linkedEvidenceId(
  data: unknown,
  fields: readonly ("evidenceId" | "sourceEvidenceId")[] | undefined
): string | undefined {
  if (fields === undefined || fields.length === 0) return undefined;
  for (const key of fields) {
    const v = inputString(data, key);
    if (v === undefined) continue;
    const parsed = parseTrimmedUuid(v);
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
    const parsed = parseTrimmedUuid(v);
    return parsed ?? null;
  }
  return undefined;
}

export function failJobEffect(
  jobId: string,
  error: string,
  opts: { caseId: CaseId; cause: JobStopCause },
  logs: string[] = []
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* failJobGen() {
    const finishedAt = yield* nowDateEffect;
    yield* settleJobEffect(
      { jobId, caseId: opts.caseId },
      { kind: "fail", cause: opts.cause },
      { error, logs, finishedAt }
    );
  });
}
