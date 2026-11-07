import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The session is the auth boundary: the sidebar reads who is signed in.
vi.mock("@better-auth-ui/react", () => ({
  useSession: () => ({
    data: {
      user: { name: "Analyst", email: "analyst@example.com" },
      session: { activeOrganizationId: "org-1" },
    },
    isPending: false,
  }),
}));

vi.mock("@better-auth-ui/react/plugins/organization", () => ({
  useListOrganizations: () => ({
    data: [{ id: "org-1", name: "Newsroom", logo: null }],
    isPending: false,
  }),
  useSetActiveOrganization: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/auth/client", () => ({ authClient: {} }));

// Only the network boundary is faked: the sidebar reads the Case through the real
// cases-context query, seeded in the cache below.
vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
}));

import { AppSidebar } from "@/app/layout/app-sidebar";
import { casesKeys } from "@/domains/cases/queries";
import { buildCaseRecord } from "@/testing/records";
import { SidebarProvider } from "@watchdog/ui/components/sidebar";

/** A real router with one catch-all route, so any pathname is "current" and links build hrefs. */
function routerAt(pathname: string) {
  const root = createRootRoute();
  const all = createRoute({ getParentRoute: () => root, path: "$" });
  return createRouter({
    routeTree: root.addChildren([all]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
}

function renderSidebar(slug: string | null, pathname = "/cases") {
  const client = new QueryClient();
  const active = slug === null ? null : buildCaseRecord({ slug });
  client.setQueryData(casesKeys.context(), {
    cases: active ? [active] : [],
    active,
  });
  return render(
    <RouterContextProvider router={routerAt(pathname)}>
      <QueryClientProvider client={client}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </QueryClientProvider>
    </RouterContextProvider>
  );
}

const WORK_LABELS = ["Tasks", "Collect", "Triage"];

function hrefs(): (string | null)[] {
  return screen.getAllByRole("link").map((link) => link.getAttribute("href"));
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

describe("AppSidebar", () => {
  it("marks each Work item inactive with the reason while there is no Case", async () => {
    renderSidebar(null);

    for (const label of WORK_LABELS) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one link at a time keeps failures readable
      const link = await screen.findByRole("link", { name: label });
      expect(link).toHaveAttribute("data-inactive");
      expect(link).toHaveAttribute("aria-description", "Create a Case first");
    }
  });

  it("leaves Work items active and unlabelled when a Case exists", async () => {
    renderSidebar("alpha");

    for (const label of WORK_LABELS) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one link at a time keeps failures readable
      const link = await screen.findByRole("link", { name: label });
      expect(link).not.toHaveAttribute("data-inactive");
      expect(link).not.toHaveAttribute("aria-description");
    }
  });

  it("names the reason in the tooltip of a Work link while there is no Case", async () => {
    const user = userEvent.setup({ delay: null });
    renderSidebar(null);

    await user.hover(await screen.findByRole("link", { name: "Tasks" }));

    expect(
      await screen.findByText("Tasks: Create a Case first")
    ).toBeInTheDocument();
  });

  it("shows the reason inline in the expanded sidebar while there is no Case", () => {
    renderSidebar(null);

    const hint = screen.getByText("Create a Case first");
    expect(hint).toBeVisible();
    // Collapsed to icons the hint is hidden; the tooltip carries the reason there.
    expect(hint).toHaveClass("group-data-[collapsible=icon]:hidden");
  });

  it("shows no inline reason when a Case exists", () => {
    renderSidebar("alpha");

    expect(screen.queryByText("Create a Case first")).not.toBeInTheDocument();
  });

  it("sends every Work link to the Cases list while there is no Case", async () => {
    renderSidebar(null);

    for (const label of WORK_LABELS) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one link at a time keeps failures readable
      expect(await screen.findByRole("link", { name: label })).toHaveAttribute(
        "href",
        "/cases"
      );
    }
    expect(hrefs()).not.toContain("/cases/alpha/collect");
  });

  it("links each Work screen into the Case in the URL", () => {
    renderSidebar("alpha");

    const links = hrefs();
    expect(links).toContain("/cases/alpha/tasks");
    expect(links).toContain("/cases/alpha/collect");
    // Triage opens on its pending view.
    const triage = links.find((href) =>
      href?.startsWith("/cases/alpha/triage")
    );
    expect(triage).toMatch(/^\/cases\/alpha\/triage\?/);
    expect(decodeURIComponent(triage ?? "")).toContain("status=");
    expect(decodeURIComponent(triage ?? "")).toContain("pending");
    expect(links).toContain("/cases");
    expect(links).not.toContain("/collect");
  });

  it("marks the screen the URL names as the current one", () => {
    renderSidebar("alpha", "/cases/alpha/collect");

    expect(screen.getByRole("link", { name: "Collect" })).toHaveAttribute(
      "data-active"
    );
    expect(screen.getByRole("link", { name: "Tasks" })).not.toHaveAttribute(
      "data-active"
    );
  });

  it("offers the dashboard, Cases, Settings and the signed-in account", () => {
    renderSidebar("alpha");

    expect(screen.getByRole("link", { name: /WATCHDOG/ })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByRole("link", { name: "Cases" })).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Settings" })) {
      expect(link).toHaveAttribute("href", "/settings");
    }
    expect(screen.getByRole("button", { name: /Analyst/ })).toBeInTheDocument();
    expect(screen.queryByText("UI kit")).not.toBeInTheDocument();
  });

  it("opens the account menu with the email and a sign-out link", async () => {
    const user = userEvent.setup({ delay: null });
    renderSidebar("alpha");

    await user.click(screen.getByRole("button", { name: /Analyst/ }));

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("analyst@example.com")).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Sign out" })
    ).toHaveAttribute("href", "/auth/sign-out");
  });
});
