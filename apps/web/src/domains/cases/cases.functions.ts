import { createServerFn } from "@tanstack/react-start";

import { resolveActiveCase } from "@/domains/cases/cases-active.server";
import {
  readActiveCaseId,
  writeActiveCaseId,
} from "@/domains/cases/lib/active-case.server";
import {
  getCaseByIdInputSchema,
  healActiveCaseInputSchema,
  setActiveCaseIdInputSchema,
  type CaseRecord,
  type CasesContext,
  type DeletedCaseRecord,
  type DeletedCasesPage,
  type DeletionPolicy,
} from "@/domains/cases/types";
import { orpcFromContext, orpcNullIfNotFound } from "@/lib/orpc.server";
import {
  createCaseInputSchema,
  deleteCaseInputSchema,
  getCaseBySlugInputSchema,
  listDeletedCasesInputSchema,
  updateCaseInputSchema,
} from "@watchdog/schemas/cases";

/** Cases + active Case from cookie; the healing rule is core's `resolveActiveCaseEffect`. */
export const getCasesContextFn = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<CasesContext> => {
    const stored = readActiveCaseId();
    const resolved = await resolveActiveCase(context, stored);

    if (resolved.active?.id !== stored) {
      writeActiveCaseId(resolved.active?.id ?? null);
    }

    return resolved;
  }
);

export const getCaseByIdFn = createServerFn({ method: "GET" })
  .validator(getCaseByIdInputSchema)
  .handler(async ({ data, context }): Promise<CaseRecord | null> =>
    orpcNullIfNotFound(
      orpcFromContext(context).cases.get({
        caseId: data.caseId,
      })
    )
  );

export const getCaseBySlugFn = createServerFn({ method: "GET" })
  .validator(getCaseBySlugInputSchema)
  .handler(async ({ data, context }): Promise<CaseRecord | null> =>
    // Org-scoped in core: a slug the caller's organization cannot see is not found,
    // the same answer as a slug that never existed.
    orpcNullIfNotFound(
      orpcFromContext(context).cases.getBySlug({ caseSlug: data.caseSlug })
    )
  );

/** The one org-checked step: the Case must be visible to the caller before it becomes Active. */
async function activateCase(
  context: Parameters<typeof orpcFromContext>[0],
  caseId: string
): Promise<void> {
  const row = await orpcNullIfNotFound(
    orpcFromContext(context).cases.get({ caseId })
  );
  if (!row) throw new Error("Case not found");
  writeActiveCaseId(caseId);
}

export const setActiveCaseIdFn = createServerFn({ method: "POST" })
  .validator(setActiveCaseIdInputSchema)
  .handler(async ({ data, context }): Promise<string | null> => {
    if (data.caseId) {
      await activateCase(context, data.caseId);
    } else {
      writeActiveCaseId(null);
    }
    return data.caseId;
  });

/**
 * The Case route's heal: the Active Case cookie follows `/cases/$slug`. Compare-and-set:
 * writes only while the cookie still holds `expectedActiveCaseId` (what the loader
 * observed), so a switch that landed in between is never overwritten by a stale heal.
 */
export const healActiveCaseFn = createServerFn({ method: "POST" })
  .validator(healActiveCaseInputSchema)
  .handler(async ({ data, context }): Promise<{ changed: boolean }> => {
    const current = readActiveCaseId();
    if (current === data.caseId || current !== data.expectedActiveCaseId) {
      return { changed: false };
    }
    await activateCase(context, data.caseId);
    return { changed: true };
  });

export const createCaseFn = createServerFn({ method: "POST" })
  .validator(createCaseInputSchema)
  .handler(async ({ data, context }): Promise<CaseRecord> => {
    const created = await orpcFromContext(context).cases.create(data);
    writeActiveCaseId(created.id);
    return created;
  });

export const updateCaseFn = createServerFn({ method: "POST" })
  .validator(updateCaseInputSchema)
  .handler(async ({ data, context }): Promise<CaseRecord> =>
    orpcFromContext(context).cases.update(data)
  );

export const deleteCaseFn = createServerFn({ method: "POST" })
  .validator(deleteCaseInputSchema)
  .handler(async ({ data, context }): Promise<void> => {
    await orpcFromContext(context).cases.delete(data);
    if (readActiveCaseId() === data.caseId) {
      const { active } = await resolveActiveCase(context, null);
      writeActiveCaseId(active?.id ?? null);
    }
  });

export const restoreCaseFn = createServerFn({ method: "POST" })
  .validator(deleteCaseInputSchema)
  .handler(async ({ data, context }): Promise<CaseRecord> =>
    orpcFromContext(context).cases.restore(data)
  );

/** Purge now: owner or admin, and only through a signed-in session (the API refuses a key). */
export const purgeCaseFn = createServerFn({ method: "POST" })
  .validator(deleteCaseInputSchema)
  .handler(async ({ data, context }): Promise<void> => {
    await orpcFromContext(context).cases.purge(data);
  });

export const listDeletedCasesFn = createServerFn({ method: "GET" })
  .validator(listDeletedCasesInputSchema)
  .handler(async ({ data, context }): Promise<DeletedCasesPage> =>
    orpcFromContext(context).cases.listDeleted(data)
  );

/**
 * The deleted Case a Case URL names, for owners and admins. Anyone else, and any slug that is
 * not a deleted Case of the caller's organization, is null: the ordinary not-found screen.
 */
export const getDeletedCaseBySlugFn = createServerFn({ method: "GET" })
  .validator(getCaseBySlugInputSchema)
  .handler(async ({ data, context }): Promise<DeletedCaseRecord | null> =>
    orpcNullIfNotFound(
      orpcFromContext(context).cases.getDeletedBySlug({
        caseSlug: data.caseSlug,
      })
    )
  );

export const getDeletionPolicyFn = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<DeletionPolicy> =>
    orpcFromContext(context).cases.deletionPolicy()
);
