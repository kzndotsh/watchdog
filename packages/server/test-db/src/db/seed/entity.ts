import {
  entities,
  entitiesRepo,
  type DbExec,
  type EntityRow,
  type NewEntity,
} from "#db";
import { slugifyName, type CaseId } from "@watchdog/domain/schemas/shared";
import { testId } from "@watchdog/domain/test-kit/fixtures";

import { withCaseOrganizationScope } from "../organization-scope.ts";
import { withSystemHistoryContext } from "../system-history-context.ts";

export async function seedEntity(
  exec: DbExec,
  caseId: CaseId,
  overrides?: Partial<NewEntity>
): Promise<EntityRow> {
  const overridesResolved = overrides ?? {};
  const name = overridesResolved.name ?? "Test Entity";
  // In the Case's organization scope (row-level security, #719), whatever `exec` is scoped to.
  const created = await withCaseOrganizationScope(
    exec,
    caseId,
    async (scoped) =>
      withSystemHistoryContext(scoped, async (tx) =>
        entitiesRepo.create(tx, {
          id: overridesResolved.id ?? testId(10),
          caseId,
          kind: overridesResolved.kind ?? "person",
          name,
          slug: overridesResolved.slug ?? (slugifyName(name) || "test-entity"),
          summary: overridesResolved.summary,
          notes: overridesResolved.notes,
        })
      )
  );
  if (!created) {
    throw new Error("seedEntity failed");
  }
  return created;
}

/** Legacy rows with blank display names (repo create rejects these at ingress). */
export async function seedEntityBlankDisplayName(
  exec: DbExec,
  caseId: CaseId,
  overrides: Partial<NewEntity> & { slug: string }
): Promise<EntityRow> {
  const [created] = await withCaseOrganizationScope(
    exec,
    caseId,
    async (scoped) =>
      withSystemHistoryContext(scoped, async (tx) =>
        tx
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
          .returning()
      )
  );
  if (!created) {
    throw new Error("seedEntityBlankDisplayName failed");
  }
  return created;
}
