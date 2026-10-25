import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-auth-ui/react", () => ({
  useAuthenticate: vi.fn(),
}));

vi.mock("@/auth/client", () => ({
  authClient: {},
}));

vi.mock("@/auth/ensure-session", () => ({
  ensureAppSession: vi.fn(),
}));

vi.mock("@/domains/cases/queries", () => ({
  casesContextQuery: vi.fn(() => ({
    queryKey: ["cases", "context"],
  })),
}));

vi.mock("@/auth/ensure-organization", () => ({
  ensureOrganizationState: vi.fn(),
}));

vi.mock("@/shared/lib/warm-query", () => ({
  ensureAppQueryData: vi.fn(),
}));

vi.mock("@/shared/hooks/use-activity-stream", () => ({
  useActivityInvalidation: vi.fn(),
}));

vi.mock("@/shared/hooks/use-cases-changed-invalidation", () => ({
  useCasesChangedInvalidation: vi.fn(),
}));

vi.mock("@/shared/layout/app-shell", async () => {
  const { useRouteCase } = await import("@/shared/hooks/use-route-case");
  return {
    AppShell: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="app-shell" data-route-case={useRouteCase()?.slug}>
        {children}
      </div>
    ),
  };
});

const routerMatches = vi.hoisted(() => ({
  current: [] as { routeId: string; context: Record<string, unknown> }[],
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    Outlet: () => <div>Protected outlet</div>,
    useRouterState: ({
      select,
    }: {
      select: (state: { matches: typeof routerMatches.current }) => unknown;
    }) => select({ matches: routerMatches.current }),
    redirect: (options: unknown) => {
      throw options;
    },
  };
});

import { ensureOrganizationState } from "@/auth/ensure-organization";
import { ensureAppSession } from "@/auth/ensure-session";
import { casesContextQuery } from "@/domains/cases/queries";
import { Route } from "@/routes/_protected";
import { useActivityInvalidation } from "@/shared/hooks/use-activity-stream";
import { useCasesChangedInvalidation } from "@/shared/hooks/use-cases-changed-invalidation";
import { ensureAppQueryData } from "@/shared/lib/warm-query";
import { buildCaseRecord } from "@/testing/records";

const aCase = buildCaseRecord();

describe("_protected route", () => {
  beforeEach(() => {
    vi.mocked(ensureAppQueryData).mockResolvedValue({
      cases: [aCase],
      active: aCase,
    });
  });

  it("redirects unauthenticated visitors to sign-in with returnTo", async () => {
    vi.mocked(ensureAppSession).mockResolvedValue(null);

    await expect(
      Route.options.beforeLoad!({
        context: { queryClient: {} },
        location: { href: "/tasks", pathname: "/tasks" },
      } as never)
    ).rejects.toEqual(
      expect.objectContaining({
        to: "/auth/$path",
        params: { path: "sign-in" },
        search: { redirectTo: "/tasks" },
      })
    );
  });

  it("returns session context when authenticated", async () => {
    const session = {
      session: { id: "sess-1" },
      user: { id: "user-1", name: "Analyst" },
    };
    const queryClient = { id: "qc-1" };
    vi.mocked(ensureOrganizationState).mockResolvedValue({
      organizationId: "org-1",
    });
    vi.mocked(ensureAppSession).mockResolvedValue(
      session as Awaited<ReturnType<typeof ensureAppSession>>
    );

    await expect(
      Route.options.beforeLoad!({
        context: { queryClient },
        location: { href: "/tasks", pathname: "/tasks" },
      } as never)
    ).resolves.toEqual({
      session,
      user: session.user,
    });

    expect(ensureAppQueryData).toHaveBeenCalledWith(
      queryClient,
      casesContextQuery()
    );
  });

  it("tells the session lookup when the navigation is a hover preload", async () => {
    const session = { session: { id: "sess-1" }, user: { id: "user-1" } };
    vi.mocked(ensureAppSession).mockResolvedValue(
      session as Awaited<ReturnType<typeof ensureAppSession>>
    );
    vi.mocked(ensureOrganizationState).mockResolvedValue({
      organizationId: "org-1",
    });
    const queryClient = {};

    await Route.options.beforeLoad!({
      context: { queryClient },
      location: { href: "/tasks", pathname: "/tasks" },
      preload: true,
    } as never);

    expect(ensureAppSession).toHaveBeenLastCalledWith(queryClient, {
      isPreload: true,
    });
    expect(ensureOrganizationState).toHaveBeenLastCalledWith(
      queryClient,
      session
    );
  });

  it("sends signed-in users without an organization to onboarding", async () => {
    const session = { session: { id: "sess-1" }, user: { id: "user-1" } };
    vi.mocked(ensureAppSession).mockResolvedValue(
      session as Awaited<ReturnType<typeof ensureAppSession>>
    );
    const queryClient = {};
    vi.mocked(ensureOrganizationState).mockResolvedValue({
      organizationId: null,
    });

    await expect(
      Route.options.beforeLoad!({
        context: { queryClient },
        location: { href: "/tasks", pathname: "/tasks" },
      } as never)
    ).rejects.toEqual(expect.objectContaining({ to: "/onboarding" }));
  });

  it("renders the authenticated app shell", () => {
    const Layout = Route.options.component!;
    render(<Layout />);

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getByText("Protected outlet")).toBeInTheDocument();
    expect(Route.options.component).toBeDefined();
  });

  it("gives the shell and every screen the Case named by the URL", () => {
    routerMatches.current = [
      { routeId: "/_protected", context: {} },
      {
        routeId: "/_protected/cases/$caseSlug",
        context: { workCase: buildCaseRecord({ slug: "beta" }) },
      },
    ];
    const Layout = Route.options.component!;
    render(<Layout />);

    expect(screen.getByTestId("app-shell")).toHaveAttribute(
      "data-route-case",
      "beta"
    );
    routerMatches.current = [];
  });

  it("names no Case outside a Case route", () => {
    routerMatches.current = [{ routeId: "/_protected/settings/", context: {} }];
    const Layout = Route.options.component!;
    render(<Layout />);

    expect(screen.getByTestId("app-shell")).not.toHaveAttribute(
      "data-route-case"
    );
    routerMatches.current = [];
  });

  it("binds the one organization-wide activity stream for the whole signed-in app", () => {
    vi.mocked(useActivityInvalidation).mockClear();
    const Layout = Route.options.component!;
    render(<Layout />);

    expect(useActivityInvalidation).toHaveBeenCalledTimes(1);
  });

  it("binds the Active Case switch invalidation once for the whole signed-in app", () => {
    vi.mocked(useCasesChangedInvalidation).mockClear();
    const Layout = Route.options.component!;
    render(<Layout />);

    expect(useCasesChangedInvalidation).toHaveBeenCalledTimes(1);
  });
});
