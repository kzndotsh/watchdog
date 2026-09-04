import { Effect } from "effect";

import type { DomainTag } from "../../infra/tagged-errors";
import { setJobStatusEffect } from "../set-job-status";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function inputString(data: unknown, key: string): string | undefined {
  if (!isRecord(data)) return undefined;
  const v = data[key];
  return typeof v === "string" ? v : undefined;
}

export function linkedEvidenceId(
  data: unknown,
  fields: readonly ("evidenceId" | "sourceEvidenceId")[] | undefined
): string | undefined {
  if (fields === undefined || fields.length === 0) return undefined;
  for (const key of fields) {
    const v = inputString(data, key);
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
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
    { unlessCancelled: true, notify: true }
  ).pipe(Effect.asVoid);
}
