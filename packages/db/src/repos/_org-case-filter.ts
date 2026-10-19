import { type AnyColumn, and, eq, sql } from "drizzle-orm";

import {
  type CaseId,
  type OrganizationId,
  parseTrimmedCaseId,
} from "@watchdog/schemas/shared";

import { cases } from "../schema/cases";
import { visibleCase } from "./_visible-case";

/**
 * Scope activity queries to an org, optionally narrowed to one case. Only visible Cases: the
 * feed, the live replay and every other reader of this filter skip a tombstoned Case.
 */
export function orgCaseFilter(
  organizationId: OrganizationId,
  caseId: CaseId | undefined,
  caseIdColumn: AnyColumn
) {
  if (caseId === undefined) {
    return and(eq(cases.organizationId, organizationId), visibleCase);
  }
  const scopedCaseId = parseTrimmedCaseId(caseId);
  if (scopedCaseId === null) {
    return and(
      eq(cases.organizationId, organizationId),
      visibleCase,
      sql`false`
    );
  }
  return and(
    eq(cases.organizationId, organizationId),
    visibleCase,
    eq(caseIdColumn, scopedCaseId)
  );
}
