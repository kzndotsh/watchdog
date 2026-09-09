import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("@/shared/lib/warm-query", () => ({
  ensureAppQueryData: vi.fn().mockResolvedValue({ cases: [], active: null }),
}));

vi.mock("@/shared/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    Outlet: () => <div>Protected outlet</div>,
    redirect: (options: unknown) => {
      throw options;
    },
  };
});

import { ensureAppSession } from "@/auth/ensure-session";
import { casesContextQuery } from "@/domains/cases/queries";
import { Route } from "@/routes/_protected";
import { ensureAppQueryData } from "@/shared/lib/warm-query";

describe("_protected route", () => {
  it("redirects unauthenticated visitors to sign-in with returnTo", async () => {
    vi.mocked(ensureAppSession).mockResolvedValue(null);

    await expect(
      Route.options.beforeLoad!({
        context: { queryClient: {} },
        location: { href: "/tasks" },
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
    vi.mocked(ensureAppSession).mockResolvedValue(
      session as Awaited<ReturnType<typeof ensureAppSession>>
    );

    await expect(
      Route.options.beforeLoad!({
        context: { queryClient },
        location: { href: "/tasks" },
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

  it("renders the authenticated app shell", () => {
    const Layout = Route.options.component!;
    render(<Layout />);

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getByText("Protected outlet")).toBeInTheDocument();
    expect(Route.options.component).toBeDefined();
  });
});
