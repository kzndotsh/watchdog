import {
  casesRepo,
  type CaseRow,
  type DbExec,
  type NewCase,
} from "@watchdog/db";
import { slugifyName } from "@watchdog/schemas";

import { TEST_ORGANIZATION_ID } from "../../fixtures/ids.ts";

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
