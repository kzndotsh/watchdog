import { useAuthenticate } from "@better-auth-ui/react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";

import { authClient } from "@/auth/client";
import { ensureOrganizationState } from "@/auth/ensure-organization";
import { ensureAppSession } from "@/auth/ensure-session";
import { casesContextQuery } from "@/domains/cases/queries";
import { useActivityInvalidation } from "@/shared/hooks/use-activity-stream";
import { useCasesChangedInvalidation } from "@/shared/hooks/use-cases-changed-invalidation";
import { RouteCaseContext } from "@/shared/hooks/use-route-case";
import { AppShell } from "@/shared/layout/app-shell";
import { ensureAppQueryData } from "@/shared/lib/warm-query";

function ProtectedLayout() {
  // Mid-visit revocation / other-tab sign-out — beforeLoad only runs on enter.
  useAuthenticate(authClient);
  // One organization-wide activity stream for the whole signed-in app.
  useActivityInvalidation();
  // One Active Case switch binding for every screen under the layout.
  useCasesChangedInvalidation();
  // The Case named by the URL, for the shell and every screen (the sidebar sits above
  // the Case route, so a router match, not a nested provider, is the source).
  const routeCase = useRouterState({
    select: (s) =>
      s.matches.find((m) => m.routeId === "/_protected/cases/$caseSlug")
        ?.context.workCase ?? null,
    // The Case row carries a branded id; the structural-sharing clone is not typed for it.
    structuralSharing: false,
  });

  return (
    <RouteCaseContext value={routeCase}>
      <AppShell>
        <Outlet />
      </AppShell>
    </RouteCaseContext>
  );
}

export const Route = createFileRoute("/_protected")({
  beforeLoad: async ({ context: { queryClient }, location, preload }) => {
    const session = await ensureAppSession(queryClient, { isPreload: preload });

    if (!session) {
      const returnTo = location.href;
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
      throw redirect({
        to: "/auth/$path",
        params: { path: "sign-in" },
        // BA UI AuthProvider reads `redirectTo` from the URL search string.
        search: { redirectTo: returnTo },
      });
    }

    // Signed in but in no organization yet (self-serve signup): create one first.
    const { organizationId } = await ensureOrganizationState(
      queryClient,
      session
    );
    if (!organizationId) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
      throw redirect({ to: "/onboarding" });
    }

    // Sidebar CaseSwitcher + case nav need cases context on every protected route.
    await ensureAppQueryData(queryClient, casesContextQuery());

    return { session, user: session.user };
  },
  component: ProtectedLayout,
});
