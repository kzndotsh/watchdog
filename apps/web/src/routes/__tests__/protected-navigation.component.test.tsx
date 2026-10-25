import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RouterContext } from "@/routes/__root";
import { createAppQueryClient } from "@/shared/lib/query-client";
import { STALE_SESSION } from "@/shared/lib/query-stale";

type Session = {
  user: { id: string; name: string };
  session: { id: string; activeOrganizationId: string | null };
};

const getSession = vi.hoisted(() => vi.fn());
const getOrganizationState = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    // The client branch only: this runs in jsdom, where the browser build would be used.
    createIsomorphicFn: () => ({
      server: () => ({
        client: (clientHandler: () => unknown) => clientHandler,
      }),
    }),
  };
});
vi.mock("@/auth/client", () => ({ authClient: { getSession } }));
vi.mock("@/domains/organization/organization.functions", () => ({
  getOrganizationStateFn: getOrganizationState,
}));
vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: async () => ({ active: null, cases: [] }),
}));
vi.mock("@/shared/hooks/use-activity-stream", () => ({
  useActivityInvalidation: () => undefined,
}));
vi.mock("@/shared/hooks/use-cases-changed-invalidation", () => ({
  useCasesChangedInvalidation: () => undefined,
}));
vi.mock("@/shared/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@better-auth-ui/react", () => ({ useAuthenticate: () => undefined }));

import { Route as ProtectedRoute } from "@/routes/_protected";
import { invalidateAfterOrganizationChange } from "@/shared/lib/query-invalidation";

function sessionFor(
  userId: string,
  activeOrganizationId: string | null = "org-1"
): Session {
  return {
    user: { id: userId, name: "Analyst" },
    session: { id: `s-${userId}`, activeOrganizationId },
  };
}

function renderApp(entry = "/library") {
  const root = createRootRouteWithContext<RouterContext>()({
    component: Outlet,
  });
  const protectedRoute = createRoute({
    ...ProtectedRoute.options,
    getParentRoute: () => root,
    id: "/_protected",
    path: "",
  });
  const page = <const P extends string>(path: P, label: string) =>
    createRoute({
      getParentRoute: () => protectedRoute,
      path,
      component: () => (
        <div>
          <p>{`page ${label}`}</p>
          <Link to="/library" preload={false}>
            go a
          </Link>
          <Link to="/deleted-cases" preload={false}>
            go b
          </Link>
          <Link to="/cases" preload={false}>
            go c
          </Link>
        </div>
      ),
    });
  const signIn = createRoute({
    getParentRoute: () => root,
    path: "/auth/$path",
    component: () => <p>sign in</p>,
  });
  const onboarding = createRoute({
    getParentRoute: () => root,
    path: "/onboarding",
    component: () => <p>onboarding</p>,
  });
  const history = createMemoryHistory({ initialEntries: [entry] });
  const queryClient = createAppQueryClient();
  const router = createRouter({
    routeTree: root.addChildren([
      protectedRoute.addChildren([
        page("/library", "a"),
        page("/deleted-cases", "b"),
        page("/cases", "c"),
      ]),
      signIn,
      onboarding,
    ]),
    history,
    context: { queryClient },
    defaultPreload: false,
  });
  render(<RouterProvider router={router} />);
  return { router, history, queryClient };
}

let now = Date.parse("2026-01-01T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  getSession.mockReset();
  getOrganizationState.mockReset();
  getOrganizationState.mockImplementation(async () => ({
    organizationId: "org-1",
  }));
});

afterEach(() => {
  vi.useRealTimers();
  now = Date.parse("2026-01-01T12:00:00Z");
});

function elapse(ms: number) {
  now += ms;
  vi.setSystemTime(now);
}

describe("_protected guard: client navigations", () => {
  it("asks the server once for the session and never for the organization when the session names it", async () => {
    getSession.mockResolvedValue(sessionFor("u1"));
    const user = userEvent.setup();
    renderApp("/library");
    await screen.findByText("page a");

    await user.click(screen.getByText("go b"));
    await screen.findByText("page b");
    await user.click(screen.getByText("go c"));
    await screen.findByText("page c");
    await user.click(screen.getByText("go a"));
    await screen.findByText("page a");

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(getOrganizationState).not.toHaveBeenCalled();
  });

  it("falls back to the organization-state call when the session names no organization, once", async () => {
    getSession.mockResolvedValue(sessionFor("u1", null));
    const user = userEvent.setup();
    renderApp("/library");
    await screen.findByText("page a");
    await user.click(screen.getByText("go b"));
    await screen.findByText("page b");
    await user.click(screen.getByText("go c"));
    await screen.findByText("page c");

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(getOrganizationState).toHaveBeenCalledTimes(1);
  });

  it("serves hover preloads from the cache without any auth request", async () => {
    getSession.mockResolvedValue(sessionFor("u1"));
    const { router } = renderApp("/library");
    await screen.findByText("page a");
    getSession.mockClear();

    await router.preloadRoute({ to: "/deleted-cases" });
    await router.preloadRoute({ to: "/cases" });
    expect(getSession).not.toHaveBeenCalled();
    expect(getOrganizationState).not.toHaveBeenCalled();

    // Even once the cached session is older than its stale time: a preload never revalidates.
    elapse(STALE_SESSION + 1);
    await router.preloadRoute({ to: "/deleted-cases" });
    expect(getSession).not.toHaveBeenCalled();
  });

  it("revalidates the session on the first navigation after its stale time, once", async () => {
    getSession.mockResolvedValue(sessionFor("u1"));
    const user = userEvent.setup();
    renderApp("/library");
    await screen.findByText("page a");

    elapse(STALE_SESSION - 1);
    await user.click(screen.getByText("go b"));
    await screen.findByText("page b");
    expect(getSession).toHaveBeenCalledTimes(1);

    elapse(2);
    await user.click(screen.getByText("go c"));
    await screen.findByText("page c");
    expect(getSession).toHaveBeenCalledTimes(2);

    await user.click(screen.getByText("go a"));
    await screen.findByText("page a");
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("redirects to sign-in with redirectTo when the session was revoked mid-visit", async () => {
    getSession.mockResolvedValueOnce(sessionFor("u1")).mockResolvedValue(null);
    const user = userEvent.setup();
    const { history } = renderApp("/library");
    await screen.findByText("page a");

    elapse(STALE_SESSION + 1);
    await user.click(screen.getByText("go b"));

    await screen.findByText("sign in");
    expect(history.location.pathname).toBe("/auth/sign-in");
    expect(history.location.search).toBe("?redirectTo=%2Fdeleted-cases");
  });

  it("redirects an unauthenticated first visit to sign-in with redirectTo", async () => {
    getSession.mockResolvedValue(null);
    const { history } = renderApp("/cases");
    await screen.findByText("sign in");
    expect(history.location.search).toBe("?redirectTo=%2Fcases");
  });

  it("does not keep a signed-out answer: signing in right after reaches the app", async () => {
    getSession.mockResolvedValueOnce(null).mockResolvedValue(sessionFor("u2"));
    const { router } = renderApp("/cases");
    await screen.findByText("sign in");

    await router.navigate({ to: "/deleted-cases" });
    await screen.findByText("page b");
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("sends a signed-in user with no organization to onboarding", async () => {
    getSession.mockResolvedValue(sessionFor("u1", null));
    getOrganizationState.mockResolvedValue({ organizationId: null });
    renderApp("/library");
    await screen.findByText("onboarding");
  });
});

describe("organization state cache", () => {
  it("is served until an organization change invalidates it", async () => {
    getSession.mockResolvedValue(sessionFor("u1", null));
    const user = userEvent.setup();
    const { queryClient } = renderApp("/library");
    await screen.findByText("page a");
    await user.click(screen.getByText("go b"));
    await screen.findByText("page b");
    expect(getOrganizationState).toHaveBeenCalledTimes(1);

    // The user created or joined an organization.
    getOrganizationState.mockResolvedValue({ organizationId: "org-2" });
    await invalidateAfterOrganizationChange(queryClient);
    await user.click(screen.getByText("go c"));
    await screen.findByText("page c");
    expect(getOrganizationState).toHaveBeenCalledTimes(2);
  });

  it("an organization change also marks the session stale, so the next navigation reads it", async () => {
    getSession.mockResolvedValue(sessionFor("u1"));
    const user = userEvent.setup();
    const { queryClient } = renderApp("/library");
    await screen.findByText("page a");

    await invalidateAfterOrganizationChange(queryClient);
    await user.click(screen.getByText("go b"));
    await screen.findByText("page b");
    await waitFor(() => {
      expect(getSession).toHaveBeenCalledTimes(2);
    });
  });

  it("never serves one user's organization to another user on the same client", async () => {
    getSession.mockResolvedValueOnce(sessionFor("u1", null));
    getOrganizationState.mockResolvedValueOnce({ organizationId: "org-1" });
    const { router } = renderApp("/library");
    await screen.findByText("page a");

    // Signed out, then another account signs in on the same tab (new session, no org).
    elapse(STALE_SESSION + 1);
    getSession.mockResolvedValue(sessionFor("u2", null));
    getOrganizationState.mockResolvedValue({ organizationId: null });
    await router.navigate({ to: "/deleted-cases" });
    await screen.findByText("onboarding");
  });
});
