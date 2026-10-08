import { type AnyColumn, and, eq, sql } from "drizzle-orm";

import {
  type CaseId,
  type OrganizationId,
  parseTrimmedCaseId,
} from "@watchdog/schemas/shared";

import { cases } from "../schema/cases";

/** Scope activity queries to an org, optionally narrowed to one case. */
export function orgCaseFilter(
  organizationId: OrganizationId,
  caseId: CaseId | undefined,
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
