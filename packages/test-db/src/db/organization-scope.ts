import { sql } from "drizzle-orm";

import {
  caseOrganizationIdUnchecked,
  cases,
  ORGANIZATION_SETTING,
  setOrganizationContext,
  type DbExec,
  type DbTx,
} from "@watchdog/db";
import type { OrganizationId } from "@watchdog/schemas/shared";

type CaseInsert = typeof cases.$inferInsert;

/**
 * Run `fn` in `organizationId`'s row-level security scope (#718): the one way a seed or a
 * repository-level test reads or writes `cases` and `claims` directly as the application role,
 * which sees none of them without a scope. Opens a transaction on a pool and a savepoint inside a
 * `tx`; the previous scope is restored after `fn`, so a seed of another organization's Case never
 * leaves the code under test in the wrong scope. Pass the `tx` it gives you to the repos.
 */
export async function withOrganizationScope<T>(
  exec: DbExec,
  organizationId: OrganizationId,
  fn: (tx: DbTx) => Promise<T>
): Promise<T> {
  return exec.transaction(async (tx) => {
    const [before] = await tx.execute<{ organization_id: string | null }>(
      sql`select current_setting(${ORGANIZATION_SETTING}, true) as organization_id`
    );
    await setOrganizationContext(tx, organizationId);
    const result = await fn(tx);
    await tx.execute(
      sql`select set_config(${ORGANIZATION_SETTING}, ${before?.organization_id ?? ""}, true)`
    );
    return result;
  });
}

/**
 * Insert Case rows of any organizations, each organization's in its own scope (row-level
 * security refuses a row outside the transaction's organization).
 */
export async function insertCasesInScope(
  exec: DbExec,
  rows: readonly CaseInsert[]
): Promise<void> {
  const byOrganization = new Map<OrganizationId, CaseInsert[]>();
  for (const row of rows) {
    const group = byOrganization.get(row.organizationId) ?? [];
    group.push(row);
    byOrganization.set(row.organizationId, group);
  }
  for (const [organizationId, group] of byOrganization) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one organization's scope at a time
    await withOrganizationScope(exec, organizationId, async (tx) => {
      await tx.insert(cases).values(group);
    });
  }
}

/** `withOrganizationScope` in the organization of an existing Case (looked up past the policies). */
export async function withCaseOrganizationScope<T>(
  exec: DbExec,
  caseId: string,
  fn: (tx: DbTx) => Promise<T>
): Promise<T> {
  const organizationId = await caseOrganizationIdUnchecked(exec, caseId);
  if (organizationId === null) throw new Error(`no such Case: ${caseId}`);
  return withOrganizationScope(exec, organizationId, fn);
}
