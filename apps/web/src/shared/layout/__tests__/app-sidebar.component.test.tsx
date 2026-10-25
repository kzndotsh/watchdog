import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockPathname = vi.hoisted(() => ({ value: "/tasks" }));

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
    Link: ({
      to,
      params,
      onClick,
      children,
    }: {
      to: string;
      params?: { caseSlug: string };
      onClick?: React.MouseEventHandler;
      children: React.ReactNode;
    }) => (
      <a
        href={to.replace("$caseSlug", params?.caseSlug ?? "")}
        onClick={(event) => {
          onClick?.(event);
          event.preventDefault();
        }}
      >
        {children}
      </a>
    ),
    useNavigate: () => vi.fn(),
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: mockPathname.value } }),
  };
});

vi.mock("@/auth/client", () => ({ authClient: {} }));

// Only the network boundary is faked: the sidebar reads the Case through the real
// cases-context query, seeded in the cache below.
vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
}));

vi.mock("@/domains/search/components/search-button", () => ({
  SearchButton: () => <div>Search button</div>,
}));

vi.mock("@/domains/organization/components/org-switcher", () => ({
  OrgSwitcher: () => <div>Org switcher</div>,
}));

vi.mock("@/shared/layout/case-switcher", () => ({
  CaseSwitcher: () => <div>Case switcher</div>,
}));

vi.mock("@/shared/layout/theme-toggle", () => ({
  modeLabel: () => "System",
  useThemeMode: () => ({
    mode: "auto",
    toggleMode: vi.fn(),
    Icon: () => <span>theme-icon</span>,
    ariaLabel: "Theme mode: auto (system).",
  }),
}));

vi.mock("@/shared/ui/primitives/button", () => ({
  Button: ({
    children,
    render,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    render?: React.ReactElement;
    "aria-label"?: string;
  }) => (
    <button type="button" aria-label={ariaLabel}>
      {render}
      {children}
    </button>
  ),
}));

vi.mock("@/shared/ui/with-tooltip", () => ({
  WithTooltip: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@watchdog/ui/components/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
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

vi.mock("@watchdog/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
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
    "aria-label": ariaLabel,
    "aria-description": ariaDescription,
    "data-inactive": dataInactive,
    tooltip,
  }: {
    children: React.ReactNode;
    render?: React.ReactElement;
    "aria-label"?: string;
    "aria-description"?: string;
    "data-inactive"?: string;
    tooltip?: string;
  }) => (
    <div
      aria-label={ariaLabel}
      aria-description={ariaDescription}
      data-inactive={dataInactive}
      data-tooltip={tooltip}
    >
      {render}
      {children}
    </div>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarSeparator: () => <hr />,
}));

vi.mock("@watchdog/ui/components/skeleton", () => ({
  Skeleton: () => <div>Skeleton</div>,
}));

import { NEW_CASE_BUTTON_ID } from "@/config/nav";
import { casesKeys } from "@/domains/cases/queries";
import { AppSidebar } from "@/shared/layout/app-sidebar";
import { buildCaseRecord } from "@/testing/records";

function renderSidebar(slug: string | null, pathname = "/tasks") {
  mockPathname.value = pathname;
  const client = new QueryClient();
  const active = slug === null ? null : buildCaseRecord({ slug });
  client.setQueryData(casesKeys.context(), {
    cases: active ? [active] : [],
    active,
  });
  return render(
    <QueryClientProvider client={client}>
      <AppSidebar />
    </QueryClientProvider>
  );
}

// The sidebar mock renders the link beside the label, so find it through the item.
function workLink(label: string): HTMLElement {
  const link = screen
    .getByText(label)
    .closest("[data-tooltip]")
    ?.querySelector("a");
  if (!link) throw new Error(`No link for ${label}`);
  return link;
}

const WORK_LABELS = ["Tasks", "Collect", "Triage"];

describe("AppSidebar", () => {
  afterEach(() => {
    mockPathname.value = "/tasks";
  });

  it("marks each Work item inactive with the reason while there is no Case", () => {
    renderSidebar(null);

    for (const label of WORK_LABELS) {
      const item = screen.getByText(label).closest("[data-tooltip]");
      expect(item).toHaveAttribute("data-inactive");
      expect(item).toHaveAttribute("aria-description", "Create a Case first");
      expect(item).toHaveAttribute(
        "data-tooltip",
        `${label}: Create a Case first`
      );
    }
  });

  it("leaves Work items active and unlabelled when a Case exists", () => {
    renderSidebar("alpha");

    for (const label of WORK_LABELS) {
      const item = screen.getByText(label).closest("[data-tooltip]");
      expect(item).not.toHaveAttribute("data-inactive");
      expect(item).not.toHaveAttribute("aria-description");
      expect(item).toHaveAttribute("data-tooltip", label);
    }
  });

  it("moves focus to the New Case button when an inactive item is clicked on /cases", async () => {
    renderSidebar(null, "/cases");
    const newCase = document.createElement("button");
    newCase.id = NEW_CASE_BUTTON_ID;
    document.body.append(newCase);

    await userEvent.click(workLink("Collect"));

    expect(newCase).toHaveFocus();
    newCase.remove();
  });

  it("does not steal focus from an inactive item off the Cases page", async () => {
    renderSidebar(null, "/");
    const newCase = document.createElement("button");
    newCase.id = NEW_CASE_BUTTON_ID;
    document.body.append(newCase);

    await userEvent.click(workLink("Collect"));

    expect(newCase).not.toHaveFocus();
    newCase.remove();
  });

  it("links each Work screen into the Case in the URL", () => {
    renderSidebar("alpha");

    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/cases/alpha/tasks",
        "/cases/alpha/collect",
        "/cases/alpha/triage",
        "/cases",
      ])
    );
    expect(hrefs).not.toContain("/collect");
  });

  it("sends Work links to the Cases list while there is no Case", () => {
    renderSidebar(null);

    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).not.toContain("/cases/alpha/collect");
    expect(hrefs.filter((href) => href === "/cases").length).toBeGreaterThan(3);
  });

  it("renders dashboard, case switcher, and account row", () => {
    renderSidebar("alpha");

    expect(screen.getByText("WATCHDOG")).toBeInTheDocument();
    expect(screen.getByText("Case switcher")).toBeInTheDocument();
    expect(screen.getByText("Org switcher")).toBeInTheDocument();
    expect(screen.getByText("Search button")).toBeInTheDocument();
    expect(screen.getAllByText("Analyst").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Collect")).toBeInTheDocument();
    expect(screen.getByText("Triage")).toBeInTheDocument();
    expect(screen.getByText("Cases")).toBeInTheDocument();
    expect(screen.queryByText("UI kit")).not.toBeInTheDocument();
  });
});
