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
import { FIRST_CASE_PATH, firstCaseGateApplies } from "@/auth/first-case-gate";
import { casesContextQuery } from "@/domains/cases/queries";
import { useActivityInvalidation } from "@/shared/hooks/use-activity-stream";
import { useCasesChangedInvalidation } from "@/shared/hooks/use-cases-changed-invalidation";
import { RouteCaseContext } from "@/shared/hooks/use-route-case";
import { AppShell } from "@/shared/layout/app-shell";
import { RootError } from "@/shared/layout/root-error";
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
  // A crash in the shell itself (pages have their own `RouteError` inside it) gets the root screen.
  errorComponent: RootError,
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

    // Sidebar CaseSwitcher + case nav need cases context on every protected route. The same
    // read answers the first-Case gate, so it costs no second query.
    const { cases } = await ensureAppQueryData(
      queryClient,
      casesContextQuery()
    );

    // No live Case in the organization: Tasks, Collect, Triage and the Case screens lead
    // nowhere, so the first-Case step comes first. Settings, Library and Deleted Cases stay
    // open (`firstCaseGateApplies`). Any signed-in member may create a Case (core
    // `createCaseEffect` has no role check; a session holds every scope), so nobody is
    // exempt for lack of permission.
    if (cases.length === 0 && firstCaseGateApplies(location.pathname)) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
      throw redirect({ to: FIRST_CASE_PATH });
    }

    return { session, user: session.user };
  },
  component: ProtectedLayout,
});
