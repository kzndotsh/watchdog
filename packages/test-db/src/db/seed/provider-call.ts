import { randomUUID } from "node:crypto";

import {
  providerCallsRepo,
  type DbExec,
  type NewProviderCallOutcome,
} from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";

type SeedProviderCallOptions = {
  seq?: number;
  url?: string;
  /** Fields of the outcome row to override; `null` seeds a call with no outcome (in flight or lost). */
  outcome?: Partial<NewProviderCallOutcome> | null;
};

/**
 * A provider call of a Job (the request side) and, unless `outcome` is `null`, how it ended: by
 * default a 200 whose body was only hashed. Written through the repo, as the Job's ledger does.
 */
export async function seedProviderCall(
  exec: DbExec,
  caseId: CaseId,
  jobId: string,
  options: SeedProviderCallOptions = {}
): Promise<{ id: string }> {
  const id = randomUUID();
  const startedAt = new Date("2026-03-01T10:00:00Z");
  await providerCallsRepo.insertRequest(exec, {
    id,
    caseId,
    jobId,
    runId: randomUUID(),
    seq: options.seq ?? 0,
    transport: "http",
    method: "GET",
    urlRedacted: options.url ?? "https://provider.test/v1/host?key=[redacted]",
    bodyKind: "response",
    requestBodyState: "none",
    startedAt,
  });
  if (options.outcome !== null) {
    await providerCallsRepo.insertOutcome(exec, {
      callId: id,
      caseId,
      outcome: "response",
      status: 200,
      hops: [
        { url: "https://provider.test/v1/host", status: 200, attempts: 1 },
      ],
      responseHeaders: { "content-type": "text/html; charset=utf-8" },
      startedAt,
      headersMs: 40,
      durationMs: 120,
      bodyState: "hashed",
      bodyReason: "hash_only",
      bodySha256: "a".repeat(64),
      bodyBytes: 321,
      endedAt: new Date("2026-03-01T10:00:00.120Z"),
      ...options.outcome,
    });
  }
  return { id };
}
