import { sql } from "drizzle-orm";

import {
  caseOrganizationIdUnchecked,
  jobOrganizationIdUnchecked,
  cases,
  ORGANIZATION_SETTING,
  setOrganizationContext,
  type DbExec,
  type DbTx,
} from "@watchdog/db";
import type { OrganizationId } from "@watchdog/schemas/shared";

type CaseInsert = typeof cases.$inferInsert;

/** The tail of each handle's queue of scoped blocks (see `inTurn`). */
const turns = new WeakMap<object, Promise<unknown>>();

/** Waits for `promise` whatever its outcome; its own caller sees a failure. */
async function settled(promise: Promise<unknown> | undefined): Promise<void> {
  try {
    await promise;
  } catch {
    // Reported to the block's own caller, not to the next block in turn.
  }
}

/**
 * Run `run` after every scoped block already started on `exec` has settled. Each block opens a
 * savepoint (or a transaction) on `exec`; two opened at once on one connection interleave, a
 * statement fails and the whole transaction aborts, so seeds started together with
 * `Promise.all` would break the test that seeds them. A block must not start another one on the
 * same `exec` (it would wait for itself); inside, use the `tx` it was given.
 */
async function inTurn<T>(exec: object, run: () => Promise<T>): Promise<T> {
  const previous = turns.get(exec);
  const current = (async () => {
    await settled(previous);
    return run();
  })();
  turns.set(exec, settled(current));
  return current;
}

/**
 * Run `fn` in `organizationId`'s row-level security scope (#718): the one way a seed or a
 * repository-level test reads or writes Case-scoped tables directly as the application role,
 * which sees none of them without a scope. Opens a transaction on a pool and a savepoint inside a
 * `tx`; the previous scope is restored after `fn`, so a seed of another organization's Case never
 * leaves the code under test in the wrong scope. Pass the `tx` it gives you to the repos. Blocks on
 * one handle run one at a time (`inTurn`).
 */
export async function withOrganizationScope<T>(
  exec: DbExec,
  organizationId: OrganizationId,
  fn: (tx: DbTx) => Promise<T>
): Promise<T> {
  return inTurn(exec, async () =>
    exec.transaction(async (tx) => {
      const [before] = await tx.execute<{ organization_id: string | null }>(
        sql`select current_setting(${ORGANIZATION_SETTING}, true) as organization_id`
      );
      await setOrganizationContext(tx, organizationId);
      const result = await fn(tx);
      await tx.execute(
        sql`select set_config(${ORGANIZATION_SETTING}, ${before?.organization_id ?? ""}, true)`
      );
      return result;
    })
  );
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

/**
 * A test read of a Case's rows in the Case's organization scope; no rows when the Case is gone
 * (its rows went with it).
 */
export async function readInCaseOrganizationScope<T>(
  exec: DbExec,
  caseId: string,
  read: (tx: DbTx) => Promise<T[]>
): Promise<T[]> {
  const organizationId = await caseOrganizationIdUnchecked(exec, caseId);
  if (organizationId === null) return [];
  return withOrganizationScope(exec, organizationId, read);
}

/** `withOrganizationScope` in the organization of an existing Job (looked up past the policies). */
export async function withJobOrganizationScope<T>(
  exec: DbExec,
  jobId: string,
  fn: (tx: DbTx) => Promise<T>
): Promise<T> {
  const organizationId = await jobOrganizationIdUnchecked(exec, jobId);
  if (organizationId === null) throw new Error(`no such Job: ${jobId}`);
  return withOrganizationScope(exec, organizationId, fn);
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
