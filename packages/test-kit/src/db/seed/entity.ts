import {
  entities,
  entitiesRepo,
  type DbExec,
  type EntityRow,
  type NewEntity,
} from "@watchdog/db";
import { slugifyName } from "@watchdog/schemas";

import { testId } from "../../fixtures/ids.ts";

export async function seedEntity(
  exec: DbExec,
  caseId: string,
  overrides?: Partial<NewEntity>
): Promise<EntityRow> {
  const overridesResolved = overrides ?? {};
  const name = overridesResolved.name ?? "Test Entity";
  const created = await entitiesRepo.create(exec, {
    id: overridesResolved.id ?? testId(10),
    caseId,
    kind: overridesResolved.kind ?? "person",
    name,
    slug: overridesResolved.slug ?? (slugifyName(name) || "test-entity"),
    summary: overridesResolved.summary,
    notes: overridesResolved.notes,
  });
  if (!created) {
    throw new Error("seedEntity failed");
  }
  return created;
}

/** Legacy rows with blank display names (repo create rejects these at ingress). */
export async function seedEntityBlankDisplayName(
  exec: DbExec,
  caseId: string,
  overrides: Partial<NewEntity> & { slug: string }
): Promise<EntityRow> {
  const [created] = await exec
    .insert(entities)
    .values({
      id: overrides.id ?? testId(10),
      caseId,
      kind: overrides.kind ?? "person",
      name: overrides.name ?? "",
      slug: overrides.slug,
      summary: overrides.summary ?? null,
      notes: overrides.notes ?? null,
    })
    .returning();
  if (!created) {
    throw new Error("seedEntityBlankDisplayName failed");
  }
  return created;
}
