import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Toaster } from "@/shared/ui/toast";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

const useCasesContextMock = vi.hoisted(() => vi.fn());
const setActiveCaseIdFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/cases/cases.functions", () => ({
  setActiveCaseIdFn,
}));

vi.mock("@/domains/cases/hooks/use-cases-context", () => ({
  useCasesContext: () => useCasesContextMock(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
    useNavigate: () => vi.fn(),
    useRouterState: ({
      select,
    }: {
      select: (state: {
        location: { pathname: string; search: Record<string, unknown> };
      }) => unknown;
    }) => select({ location: { pathname: "/tasks", search: {} } }),
  };
});

vi.mock("@/shared/lib/query-invalidation", () => ({
  bindCasesChangedInvalidation: vi.fn(),
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenuButton: ({
    children,
    render,
  }: {
    children: React.ReactNode;
    render?: React.ReactElement;
  }) => (
    <div>
      {render}
      {children}
    </div>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useSidebar: () => ({ state: "expanded", isMobile: false }),
}));

vi.mock("@watchdog/ui/components/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { CaseSwitcher } from "@/shared/layout/case-switcher";

const ALPHA = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha Case",
  description: null,
  allowThirdPartyEgress: false,
};
const BETA = {
  id: testId(11),
  slug: "beta",
  name: "Beta Case",
  description: null,
  allowThirdPartyEgress: false,
};

describe("CaseSwitcher switching", () => {
  it("shows the shared switch failure copy when the server rejects the switch", async () => {
    setActiveCaseIdFn.mockRejectedValueOnce(
      Object.assign(new Error("Internal server error"), { status: 500 })
    );
    useCasesContextMock.mockReturnValue({
      casesCtx: { active: ALPHA, cases: [ALPHA, BETA] },
      cases: [ALPHA, BETA],
      active: ALPHA,
      pending: false,
      loadError: null,
      retry: vi.fn(),
      placeholder: false,
    });
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Toaster />
        <CaseSwitcher />
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: /Beta Case/ }));

    expect(
      await screen.findByText("Couldn't switch Case. Try again.")
    ).toBeInTheDocument();
  });
});
