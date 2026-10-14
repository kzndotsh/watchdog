import type { QueryClient } from "@tanstack/react-query";

import { organizationStateQuery } from "@/domains/organization/queries";
import { seedOrganizationState } from "@/shared/lib/query-invalidation";

type SessionLike = {
  user: { id: string };
  session: { activeOrganizationId?: string | null };
};

/**
 * The organization the signed-in user acts in, for the route guard (`null` = none yet →
 * onboarding). Cached until an organization change invalidates it
 * (`invalidateAfterOrganizationChange`), per user.
 *
 * On the client, when nothing is cached yet and the session names an active organization,
 * that name answers the gate: the session already came from one auth request, so a
 * navigation does not pay a second. The server never takes that shortcut: a full page load
 * asks the database (`getOrganizationStateFn` reads the membership), so a stale name in the
 * session is corrected on every reload. Either way the server functions the pages call read
 * membership on every request, so this answer only decides where the user is sent.
 */
export async function ensureOrganizationState(
  queryClient: QueryClient,
  session: SessionLike
): Promise<{ organizationId: string | null }> {
  const options = organizationStateQuery(session.user.id);
  const named = session.session.activeOrganizationId;
  // Only a query that was never created: an invalidated, loading or failed one asks the
  // server (seeding would hide a failure and answer from a name the server may disagree with).
  if (
    typeof window !== "undefined" &&
    named &&
    queryClient.getQueryState(options.queryKey) === undefined
  ) {
    seedOrganizationState(queryClient, session.user.id, named);
  }
  return queryClient.query(options);
}
