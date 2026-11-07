import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { ensureOrganizationState } from "@/app/ensure-organization";
import { ensureAppSession } from "@/auth/ensure-session";

/**
 * The route guard for every screen that needs a signed-in user. No session: redirect to
 * sign-in carrying the page asked for as `redirectTo` (the Better Auth UI AuthProvider reads
 * it from the URL search string). Otherwise the session and the organization the user acts
 * in (`null` = none yet; the caller decides where that leads).
 */
export async function requireSession(
  queryClient: QueryClient,
  location: { href: string },
  opts?: { isPreload?: boolean }
) {
  const session = await ensureAppSession(queryClient, opts);
  if (!session) {
    throw redirect({
      to: "/auth/$path",
      params: { path: "sign-in" },
      search: { redirectTo: location.href },
    });
  }
  const { organizationId } = await ensureOrganizationState(
    queryClient,
    session
  );
  return { session, organizationId };
}

/** The sign-in and sign-up screens' guard: a signed-in user goes home instead. */
export async function redirectIfSignedIn(
  queryClient: QueryClient
): Promise<void> {
  const session = await ensureAppSession(queryClient);
  if (session) throw redirect({ to: "/" });
}
