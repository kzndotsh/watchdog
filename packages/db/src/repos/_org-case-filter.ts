import { type AnyColumn, and, eq, sql } from "drizzle-orm";

import { parseTrimmedCaseId } from "@watchdog/schemas";

import { cases } from "../schema/cases";

/** Scope activity queries to an org, optionally narrowed to one case. */
export function orgCaseFilter(
  organizationId: string,
  caseId: string | undefined,
  caseIdColumn: AnyColumn
) {
  if (caseId === undefined) {
    return eq(cases.organizationId, organizationId);
  }
  const scopedCaseId = parseTrimmedCaseId(caseId);
  if (scopedCaseId === null) {
    return and(eq(cases.organizationId, organizationId), sql`false`);
  }
  return and(
    eq(cases.organizationId, organizationId),
    eq(caseIdColumn, scopedCaseId)
  );
}
