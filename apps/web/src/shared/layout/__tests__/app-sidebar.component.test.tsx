import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@better-auth-ui/react", () => ({
  useSession: () => ({
    data: { user: { name: "Analyst", email: "analyst@example.com" } },
    isPending: false,
  }),
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
      select: (state: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: "/tasks" } }),
  };
});

vi.mock("@/auth/client", () => ({ authClient: {} }));

vi.mock("@/domains/search/components/command-search-trigger", () => ({
  CommandSearchTrigger: () => <div>Search trigger</div>,
}));

vi.mock("@/shared/layout/case-switcher", () => ({
  CaseSwitcher: () => <div>Case switcher</div>,
}));

vi.mock("@/shared/layout/theme-toggle", () => ({
  ThemeMenuItem: () => <div>Theme menu</div>,
}));

vi.mock("@/shared/ui/shadcn/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@/shared/ui/shadcn/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/shared/ui/shadcn/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/shared/ui/shadcn/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <aside>{children}</aside>
  ),
  SidebarContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarHeader: ({ children }: { children: React.ReactNode }) => (
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
}));

vi.mock("@/shared/ui/shadcn/skeleton", () => ({
  Skeleton: () => <div>Skeleton</div>,
}));

import { AppSidebar } from "@/shared/layout/app-sidebar";

describe("AppSidebar", () => {
  it("renders dashboard branding, search, case switcher, and user menu", () => {
    render(<AppSidebar />);

    expect(screen.getByText("WATCHDOG")).toBeInTheDocument();
    expect(screen.getByText("Search trigger")).toBeInTheDocument();
    expect(screen.getByText("Case switcher")).toBeInTheDocument();
    expect(screen.getAllByText("Analyst").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Collect")).toBeInTheDocument();
    expect(screen.getByText("Triage")).toBeInTheDocument();
    expect(screen.getByText("Cases")).toBeInTheDocument();
    expect(screen.getByText("Theme menu")).toBeInTheDocument();
  });
});
