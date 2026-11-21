import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LAST_CASE_STORAGE_KEY } from "@/domains/cases/lib/active-case";
import { testId } from "@watchdog/test-kit";

const useCasesContextMock = vi.hoisted(() => vi.fn());
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
    useMatchRoute: () => () => false,
    useRouterState: ({
      select,
    }: {
      select: (state: {
        location: { pathname: string; search: Record<string, unknown> };
      }) => unknown;
    }) => select({ location: { pathname: "/tasks", search: {} } }),
  };
});

vi.mock("@/app/lib/query-invalidation", () => ({
  invalidateAfterCaseSwitch: vi.fn(),
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

import { CaseSwitcher } from "@/app/layout/case-switcher";

const ALPHA = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha Case",
  description: null,
  allowedEgress: ["local", "target"],
};
const BETA = {
  id: testId(11),
  slug: "beta",
  name: "Beta Case",
  description: null,
  allowedEgress: ["local", "target"],
};

afterEach(() => {
  window.localStorage.removeItem(LAST_CASE_STORAGE_KEY);
});

describe("CaseSwitcher switching", () => {
  it("on a Case-less screen makes the picked Case the last one entered, with no server write", async () => {
    useCasesContextMock.mockReturnValue({
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
        <CaseSwitcher />
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: /Beta Case/ }));

    await vi.waitFor(() => {
      expect(window.localStorage.getItem(LAST_CASE_STORAGE_KEY)).toBe(BETA.id);
    });
  });
});
