import { eq } from "drizzle-orm";

import {
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
  overrides?: Partial<NewCase>
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
  return created;
}

/**
 * Move a tombstone's `deleted_at` (an age for the restore window and the purge job: production
 * code never sets it by hand, `casesRepo.tombstone` stamps the clock) and clear any purge mark.
 */
export async function backdateCaseDeletion(
  exec: DbExec,
  caseId: CaseRow["id"],
  deletedAt: Date
): Promise<void> {
  await exec.update(cases).set({ deletedAt }).where(eq(cases.id, caseId));
}
