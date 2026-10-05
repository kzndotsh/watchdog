import { type AnyColumn, and, eq, sql } from "drizzle-orm";

import { parseTrimmedCaseId } from "@watchdog/schemas/shared";

import { cases } from "../schema/cases";
import { scopeOrganizationId } from "./_scoped-ids";

/** Scope activity queries to an org, optionally narrowed to one case. */
export function orgCaseFilter(
  organizationId: string,
  caseId: string | undefined,
  caseIdColumn: AnyColumn
) {
  const scopedOrganizationId = scopeOrganizationId(organizationId);
  if (scopedOrganizationId === undefined) return sql`false`;
  if (caseId === undefined) {
    return eq(cases.organizationId, scopedOrganizationId);
  }
  const scopedCaseId = parseTrimmedCaseId(caseId);
  if (scopedCaseId === null) {
    return and(eq(cases.organizationId, scopedOrganizationId), sql`false`);
  }
  return and(
    eq(cases.organizationId, scopedOrganizationId),
    eq(caseIdColumn, scopedCaseId)
  );
}
