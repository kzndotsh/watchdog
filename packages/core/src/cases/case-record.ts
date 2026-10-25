import type { CaseRow } from "@watchdog/db";
import type { CaseId, EgressClass } from "@watchdog/schemas/shared";

export type CaseRecord = {
  id: CaseId;
  name: string;
  slug: string;
  description: string | null;
  allowedEgress: EgressClass[];
};

export function toRecord(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    allowedEgress: [...row.allowedEgress],
  };
}
