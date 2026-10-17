import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import type { WORK_TO, WorkScreen } from "@/config/nav";
import { casesContextQuery } from "@/domains/cases/queries";
import { ensureAppQueryData } from "@/shared/lib/warm-query";

const DOSSIER_TO = "/cases/$caseSlug/entities/$entitySlug";

/**
 * Case-less Work URLs (`/collect`, `/entities/$slug`, ...) predate the Case segment.
 * Bookmarks still open: the Active Case cookie names the Case, and the route redirects
 * to the slugged URL. With no Active Case (an organization with no visible Case) there
 * is nothing to open, so the Cases list is the destination.
 */
export async function legacyWorkCaseSlug(
  queryClient: QueryClient
): Promise<string> {
  const { active } = await ensureAppQueryData(queryClient, casesContextQuery());
  if (!active) {
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() throws
    throw redirect({ to: "/cases", replace: true });
  }
  return active.slug;
}

/** The slugged Work screens a Case-less bookmark can land on. */
type LegacyWorkTarget = (typeof WORK_TO)[WorkScreen];

/**
 * The `beforeLoad` of a Case-less Work route: redirect to `to` under the Active Case,
 * keeping the route's own params (a Dossier's `entitySlug`) and its search.
 */
export function legacyWorkRedirect(to: LegacyWorkTarget | typeof DOSSIER_TO) {
  return async ({
    context: { queryClient },
    params,
  }: {
    context: { queryClient: QueryClient };
    params: Record<string, string>;
  }): Promise<never> => {
    const caseSlug = await legacyWorkCaseSlug(queryClient);
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() throws
    throw redirect({
      to,
      params: { ...params, caseSlug },
      search: true,
      replace: true,
    });
  };
}
