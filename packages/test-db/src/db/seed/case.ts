import { eq } from "drizzle-orm";

import {
  caseDeletionRecordsRepo,
  cases,
  casesRepo,
  type CaseRow,
  type DbExec,
  type NewCase,
} from "@watchdog/db";
import { slugifyName } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";

export async function seedCase(
  exec: DbExec,
  overrides?: Partial<NewCase> & { allowThirdPartyEgress?: boolean }
): Promise<CaseRow> {
  const overridesResolved = overrides ?? {};
  const name = overridesResolved.name ?? "Test Case";
  const base = slugifyName(name) || "test-case";
  const created = await casesRepo.create(exec, {
    name,
    slug:
      overridesResolved.slug ??
      `${base}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    description: overridesResolved.description ?? null,
    organizationId: overridesResolved.organizationId ?? TEST_ORGANIZATION_ID,
  });
  if (!created) {
    throw new Error("seedCase failed");
  }
  // State setup, not the owner-or-admin rule: written straight through the repo.
  if (overridesResolved.allowThirdPartyEgress === undefined) return created;
  const updated = await casesRepo.update(
    exec,
    created.id,
    created.organizationId,
    { allowThirdPartyEgress: overridesResolved.allowThirdPartyEgress }
  );
  if (!updated) {
    throw new Error("seedCase failed to set egress");
  }
  return updated;
}

async function lifecycleSubject(exec: DbExec, caseId: CaseRow["id"]) {
  const [row] = await exec
    .select({
      organizationId: cases.organizationId,
      name: cases.name,
      slug: cases.slug,
    })
    .from(cases)
    .where(eq(cases.id, caseId));
  if (row === undefined) throw new Error("no such Case");
  return row;
}

async function appendRecord(
  exec: DbExec,
  caseId: CaseRow["id"],
  event: "deleted" | "purge_started" | "purged"
): Promise<void> {
  const row = await lifecycleSubject(exec, caseId);
  await caseDeletionRecordsRepo.append(exec, {
    caseId,
    organizationId: row.organizationId,
    caseName: row.name,
    caseSlug: row.slug,
    event,
    actorId: null,
    actorLabel: null,
  });
}

/**
 * Move a tombstone's `deleted_at` and `purge_after` (an age for the restore window and the purge
 * job: production code never sets them by hand). The database refuses a lifecycle change without a
 * deletion record in the same transaction, so a `deleted` record is written first in one
 * transaction with the change, as a real re-delete would.
 */
export async function backdateCaseDeletion(
  exec: DbExec,
  caseId: CaseRow["id"],
  window: { deletedAt: Date; purgeAfter: Date }
): Promise<void> {
  await exec.transaction(async (tx) => {
    await appendRecord(tx, caseId, "deleted");
    await tx.update(cases).set(window).where(eq(cases.id, caseId));
  });
}

/**
 * Make a Case ready for a raw `delete from cases` by the application role: the `deleted` record
 * and the tombstone, then the `purged` record, all in the caller's transaction (the database
 * refuses a Case delete without them, and `exec` must be that transaction, not a pool).
 */
export async function prepareCasePurge(
  exec: DbExec,
  caseId: CaseRow["id"]
): Promise<void> {
  const row = await lifecycleSubject(exec, caseId);
  await appendRecord(exec, caseId, "deleted");
  const now = new Date();
  await casesRepo.tombstone(exec, caseId, row.organizationId, {
    deletedAt: now,
    deletedBy: null,
    purgeAfter: now,
  });
  await appendRecord(exec, caseId, "purged");
}

/** Mark a tombstone's purge as begun, with the `purge_started` record the database demands. */
export async function startCasePurge(
  exec: DbExec,
  caseId: CaseRow["id"]
): Promise<void> {
  await exec.transaction(async (tx) => {
    await appendRecord(tx, caseId, "purge_started");
    await casesRepo.markDeletedPurgeStarted(tx, caseId, new Date());
  });
}
