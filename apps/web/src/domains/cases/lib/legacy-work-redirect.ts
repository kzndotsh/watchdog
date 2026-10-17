import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { casesContextQuery } from "@/domains/cases/queries";
import { ensureAppQueryData } from "@/shared/lib/warm-query";

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
