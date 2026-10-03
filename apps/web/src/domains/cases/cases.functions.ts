import { createServerFn } from "@tanstack/react-start";

import {
  readActiveCaseId,
  writeActiveCaseId,
} from "@/domains/cases/lib/active-case.server";
import {
  createCaseInputSchema,
  deleteCaseInputSchema,
  getCaseByIdInputSchema,
  getCaseBySlugInputSchema,
  setActiveCaseIdInputSchema,
  updateCaseInputSchema,
  type CaseRecord,
  type CasesContext,
} from "@/domains/cases/types";
import { orpcFromContext, orpcNullIfNotFound } from "@/lib/orpc.server";

/** Cases + active Case from cookie; heals invalid/missing selection. */
export const getCasesContextFn = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<CasesContext> => {
    const cases = await orpcFromContext(context).cases.list();
    const stored = readActiveCaseId();
    const active =
      (stored ? cases.find((c) => c.id === stored) : undefined) ??
      cases[0] ??
      null;

    if (active?.id !== stored) {
      writeActiveCaseId(active?.id ?? null);
    }

    return { cases, active };
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
  .handler(async ({ data, context }): Promise<CaseRecord | null> => {
    const cases = await orpcFromContext(context).cases.list();
    return cases.find((row) => row.slug === data.caseSlug) ?? null;
  });

export const setActiveCaseIdFn = createServerFn({ method: "POST" })
  .validator(setActiveCaseIdInputSchema)
  .handler(async ({ data, context }): Promise<string | null> => {
    if (data.caseId) {
      const row = await orpcNullIfNotFound(
        orpcFromContext(context).cases.get({ caseId: data.caseId })
      );
      if (!row) throw new Error("Case not found");
    }

    writeActiveCaseId(data.caseId);
    return data.caseId;
  });

/**
 * The Case route's heal: the Active Case cookie follows `/cases/$slug`. Compare-and-set
 * on the server so the loader needs no client-side read of the cookie or the URL.
 */
export const healActiveCaseFn = createServerFn({ method: "POST" })
  .validator(getCaseByIdInputSchema)
  .handler(async ({ data, context }): Promise<{ changed: boolean }> => {
    if (readActiveCaseId() === data.caseId) return { changed: false };
    const row = await orpcNullIfNotFound(
      orpcFromContext(context).cases.get({ caseId: data.caseId })
    );
    if (!row) throw new Error("Case not found");
    writeActiveCaseId(data.caseId);
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
      const remaining = await orpcFromContext(context).cases.list();
      writeActiveCaseId(remaining[0]?.id ?? null);
    }
  });
