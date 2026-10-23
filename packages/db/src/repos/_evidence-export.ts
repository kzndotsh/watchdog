import { and, eq, isNull, sql } from "drizzle-orm";

import type { CaseId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { evidence } from "../schema/evidence";

/**
 * What a Case export needs to know before it reads any body: how many active Evidence rows
 * there are, and the bytes of the text bodies it will write itself (rows with no stored file).
 * The text is measured in the database (`octet_length`), never fetched.
 *
 * Raw `sql` by necessity (an aggregate over `octet_length`), kept here, outside `*.repo.ts`,
 * like `_evidence-ids.ts`.
 */
export async function selectEvidenceExportSizes(
  exec: DbExec,
  caseId: CaseId
): Promise<{ count: number; textBytes: number }> {
  const [row] = await exec
    .select({
      count: sql<number>`count(*)::int`,
      textBytes: sql<number>`coalesce(sum(octet_length(${evidence.text})) filter (where ${evidence.uri} is null or ${evidence.uri} = ''), 0)::float8`,
    })
    .from(evidence)
    .where(and(eq(evidence.caseId, caseId), isNull(evidence.deletedAt)));
  return { count: row?.count ?? 0, textBytes: row?.textBytes ?? 0 };
}
