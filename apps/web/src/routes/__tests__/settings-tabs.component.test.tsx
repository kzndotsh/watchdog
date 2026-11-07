import { QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAppQueryClient } from "@/app/lib/query-client";
import type { RouterContext } from "@/routes/__root";
import { SidebarProvider } from "@watchdog/ui/components/sidebar";

/** Who is signed in: the auth boundary, set per test. */
const accounts = vi.hoisted(() => {
  const admin = { user: { id: "u1", role: "admin" }, session: { id: "s1" } };
  const member = { user: { id: "u2", role: "user" }, session: { id: "s2" } };
  return { admin, member, current: admin };
});

vi.mock("@/auth/ensure-session", () => ({
  // The client branch refetches the session on every navigation (staleTime 0).
  ensureAppSession: async () => {
    await Promise.resolve();
    return accounts.current;
  },
}));
vi.mock("@/domains/organization/organization.functions", () => ({
  getOrganizationStateFn: async () => ({ organizationId: "o1" }),
}));
vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: async () => ({ active: null, cases: [] }),
}));
vi.mock("@/app/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const listCredentialsFn = vi.hoisted(() => vi.fn());
vi.mock("@/domains/settings/settings.functions", () => ({
  listCredentialsFn,
}));
vi.mock("@better-auth-ui/react", () => ({
  useAuthenticate: () => undefined,
  useSession: () => ({ data: accounts.current, isPending: false }),
}));
vi.mock("@/auth/ui/settings/settings", () => ({
  Settings: (props: { view?: string }) => (
    <div>{`Settings${props.view ?? ""}`}</div>
  ),
}));
vi.mock("@/auth/ui/api-key/api-keys", () => ({
  ApiKeys: () => <div>ApiKeys</div>,
}));
vi.mock("@/domains/organization/components/organization-members", () => ({
  OrganizationMembers: () => <div>OrganizationMembers</div>,
}));
vi.mock("@/domains/organization/components/organization-profile", () => ({
  OrganizationProfile: () => <div>OrganizationProfile</div>,
}));
vi.mock("@/domains/organization/components/your-organizations", () => ({
  YourOrganizations: () => <div>YourOrganizations</div>,
}));
vi.mock("@/domains/settings/components/settings-users", () => ({
  SettingsUsers: () => <div>SettingsUsers</div>,
}));

import { Route as ProtectedRoute } from "@/routes/_protected";
import { Route as SettingsRoute } from "@/routes/_protected/settings/index";

const TABS: readonly [string, string, string][] = [
  ["Security", "security", "Settingssecurity"],
  ["Appearance", "appearance", "Theme"],
  ["API Keys", "api-keys", "ApiKeys"],
  ["Credentials", "credentials", "No services to connect yet."],
  ["Organizations", "organizations", "YourOrganizations"],
  ["General", "organization", "OrganizationProfile"],
  ["Members", "members", "OrganizationMembers"],
  ["Users", "users", "SettingsUsers"],
];

/**
 * The `_protected` layout re-runs an async beforeLoad (session + org fetch) on every
 * navigation, so the router location leads the matched route search for a while.
 */
function renderSettingsAt(entry: string) {
  const root = createRootRouteWithContext<RouterContext>()({
    component: Outlet,
  });
  const protectedRoute = createRoute({
    ...ProtectedRoute.options,
    getParentRoute: () => root,
    id: "/_protected",
    path: "",
  });
  const settings = createRoute({
    validateSearch: SettingsRoute.options.validateSearch,
    loaderDeps: SettingsRoute.options.loaderDeps,
    loader: SettingsRoute.options.loader,
    component: SettingsRoute.options.component,
    getParentRoute: () => protectedRoute,
    path: "/settings/",
  });
  const history = createMemoryHistory({ initialEntries: [entry] });
  const queryClient = createAppQueryClient();
  const router = createRouter({
    routeTree: root.addChildren([protectedRoute.addChildren([settings])]),
    history,
    context: { queryClient },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <RouterProvider router={router} />
      </SidebarProvider>
    </QueryClientProvider>
  );
  return { history, router };
}

beforeEach(() => {
  accounts.current = accounts.admin;
  listCredentialsFn.mockReset().mockResolvedValue([]);
});

describe("settings route tabs", () => {
  it.each(TABS)(
    "switches to %s on click and keeps the URL tab",
    async (label, tab, panel) => {
      const user = userEvent.setup();
      const { history, router } = renderSettingsAt("/settings");
      await user.click(await screen.findByRole("button", { name: label }));
      expect(await screen.findByText(panel)).toBeInTheDocument();
      // The URL must STAY on the tab once the navigation has settled.
      await waitFor(() => {
        expect(router.state.status).toBe("idle");
        expect(router.state.isLoading).toBe(false);
      });
      expect(history.location.search).toBe(`?tab=${tab}`);
      expect(screen.getByText(panel)).toBeInTheDocument();
    }
  );

  it("strips an unusable tab from the URL once the route settles", async () => {
    const { history } = renderSettingsAt("/settings?tab=bogus");
    await screen.findByRole("button", { name: "Security" });
    await waitFor(() => {
      expect(history.location.search).toBe("");
    });
    expect(screen.getByText("Settingsaccount")).toBeInTheDocument();
  });

  it("opens the account panel when no tab is named", async () => {
    renderSettingsAt("/settings");
    expect(await screen.findByText("Settingsaccount")).toBeInTheDocument();
  });

  it("reads the credentials while the route loads, before its tab is opened", async () => {
    renderSettingsAt("/settings");
    await screen.findByText("Settingsaccount");
    await waitFor(() => {
      expect(listCredentialsFn).toHaveBeenCalledTimes(1);
    });
  });

  it("offers the Users tab to server admins only", async () => {
    accounts.current = accounts.member;
    renderSettingsAt("/settings?tab=users");

    expect(
      await screen.findByText("Only server admins can manage accounts.")
    ).toBeInTheDocument();
    expect(screen.queryByText("SettingsUsers")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Users" })
    ).not.toBeInTheDocument();
  });
});
