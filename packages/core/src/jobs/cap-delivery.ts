import { Effect } from "effect";

import { jobsRepo } from "@watchdog/db";
import { isOpenJobStatus, parseTrimmedUuid } from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";
import { failJobEffect, isPlainRecord } from "./stages/helpers";

/** Best-effort domain job id from a pg-boss delivery payload. */
export function extractDomainJobIdFromPayload(
  data: unknown
): string | undefined {
  if (!isPlainRecord(data)) return undefined;
  const jobId = data.jobId;
  if (typeof jobId !== "string") return undefined;
  return parseTrimmedUuid(jobId) ?? undefined;
}

/** Mark an open domain Job failed when pg-boss delivered an invalid payload. */
export function failInvalidCapDeliveryEffect(
  jobId: string
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* failInvalidCapDeliveryGen() {
    const normalizedJobId = parseTrimmedUuid(jobId) ?? undefined;
    if (normalizedJobId === undefined) return;
    const row = yield* tryDbWith((exec) => jobsRepo.get(exec, normalizedJobId));
    if (row === null || !isOpenJobStatus(row.status)) return;
    yield* failJobEffect(
      normalizedJobId,
      "invalid_payload",
      {
        caseId: row.caseId,
      },
      row.logs ?? []
    );
  });
}
