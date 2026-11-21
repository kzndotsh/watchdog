import { sql, type SQL } from "drizzle-orm";
import { pgPolicy, text, type AnyPgColumn } from "drizzle-orm/pg-core";

import type { OrganizationId } from "@watchdog/schemas/shared";

/**
 * The organization the current transaction acts for, for row-level security policies: the
 * `watchdog.org_id` setting (`ORGANIZATION_SETTING`) through `graph_history_setting`, which maps
 * the empty string a reused pooled connection holds to NULL, so an unset organization matches no
 * row. The scalar subquery makes Postgres evaluate it once per statement (an InitPlan), not per
 * row. The setting name is spelled here, not imported, because drizzle-kit reads the schema files
 * on their own.
 */
export const currentOrganization: SQL = sql.raw(
  "(select public.graph_history_setting('watchdog.org_id'))"
);

/**
 * A Case-scoped table's copy of its Case's organization (row-level security, #718, #719): the
 * policy compares a column of the row, a plain equality on an indexed column, so list plans keep
 * their indexes. Never written by a caller: the table's BEFORE INSERT trigger
 * (`organization_from_case`) sets it from the Case (the insert sends NULL), and a composite
 * foreign key `(case_id, organization_id)` into `cases` keeps it the Case's own. NOT NULL in the
 * table (and drizzle-kit's snapshot), optional in the insert type.
 */
export function caseOrganizationId() {
  return text("organization_id")
    .$type<OrganizationId>()
    .notNull()
    .$defaultFn(() => sql`null`);
}

/**
 * Organization isolation on a table that holds its organization (`organization_id`): a row is
 * visible and writable when it is the transaction's organization's; with none set, no row is.
 * `TO public` without FORCE, like the policy on `cases`: the table owner (migrations, `just wipe`,
 * the SECURITY DEFINER functions and triggers) is not subject to it.
 */
export function organizationIsolation(
  table: string,
  organizationId: AnyPgColumn
) {
  return pgPolicy(`${table}_organization_isolation`, {
    as: "permissive",
    for: "all",
    to: "public",
    using: sql`${organizationId} = ${currentOrganization}`,
    withCheck: sql`${organizationId} = ${currentOrganization}`,
  });
}

/**
 * Organization isolation through the row's Case, for a table read through a parent row or by one
 * Case's own index and never joined by a list or scanned by search (Evidence links, provider-call
 * records, the Cap cache, upload bookkeeping, Collect's projection): a row is visible and writable
 * when its Case is, and `cases`' own policy shows only the transaction's organization's Cases.
 * One primary-key probe of `cases` per statement or per row read. A table a list joins takes a
 * copy column instead (`caseOrganizationId`): there the probe is a subplan per joined row.
 */
export function caseIsolation(table: string, caseId: AnyPgColumn) {
  const visibleCase = sql`exists (select 1 from public.cases c where c.id = ${caseId})`;
  return pgPolicy(`${table}_organization_isolation`, {
    as: "permissive",
    for: "all",
    to: "public",
    using: visibleCase,
    withCheck: visibleCase,
  });
}
