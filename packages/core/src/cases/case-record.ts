import type { z } from "zod";

import type { CaseRow } from "@watchdog/db";
import type { caseSchema } from "@watchdog/schemas/cases";

/** A Case as the API returns it: the output of `caseSchema`. */
export type CaseRecord = z.output<typeof caseSchema>;

export function toRecord(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    allowedEgress: [...row.allowedEgress],
  };
}
