import type { QueryClient } from "@tanstack/react-query";

import { healActiveCaseFn } from "@/domains/cases/cases.functions";
import { getActiveCaseHealEpoch } from "@/domains/cases/lib/active-case";
import { casesContextQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { finalizeActiveCaseSwitch } from "@/shared/lib/active-case-switch";
import { ensureAppQueryData } from "@/shared/lib/warm-query";

/**
 * The cookie follows the Case in the URL (the last Case entered is the default for
 * screens without one). The server compare-and-sets (`healActiveCaseFn`): it writes only
 * while the cookie still holds the Active Case this loader observed. The client then
 * settles its caches through the shared switch helper. An intent preload never heals, and
 * a newer switch (epoch bump since the loader started) wins over a stale loader, both
 * before the call and after it.
 */
export async function healActiveCaseToRoute(
  queryClient: QueryClient,
  caseRow: CaseRecord,
  shouldPreload: boolean,
  epoch: number
): Promise<void> {
  if (shouldPreload) return;

  const ctx = await ensureAppQueryData(queryClient, casesContextQuery());
  const observedActiveId = ctx.active?.id ?? null;
  if (observedActiveId === caseRow.id || epoch !== getActiveCaseHealEpoch()) {
    return;
  }

  const { changed } = await healActiveCaseFn({
    data: { caseId: caseRow.id, expectedActiveCaseId: observedActiveId },
  });
  if (!changed || epoch !== getActiveCaseHealEpoch()) return;

  await finalizeActiveCaseSwitch(queryClient, caseRow);
}
