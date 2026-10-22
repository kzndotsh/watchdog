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
import { describe, expect, it, vi } from "vitest";

import type { RouterContext } from "@/routes/__root";
import { createAppQueryClient } from "@/shared/lib/query-client";

const session = { user: { id: "u1", role: "admin" }, session: { id: "s1" } };

vi.mock("@/auth/ensure-session", () => ({
  // The client branch refetches the session on every navigation (staleTime 0).
  ensureAppSession: async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30);
    });
    return session;
  },
}));
vi.mock("@/domains/organization/organization.functions", () => ({
  getOrganizationStateFn: async () => ({ organizationId: "o1" }),
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
vi.mock("@/domains/settings/settings.functions", () => ({
  listCredentialsFn: async () => [],
}));
vi.mock("@better-auth-ui/react", () => ({
  useAuthenticate: () => undefined,
  useSession: () => ({ data: session, isPending: false }),
}));
vi.mock("@/shared/layout/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/auth/ui/settings/settings", () => ({
  Settings: (props: { view?: string }) => (
    <div data-testid="panel">{`Settings${props.view ?? ""}`}</div>
  ),
}));
vi.mock("@/auth/ui/api-key/api-keys", () => ({
  ApiKeys: () => <div data-testid="panel">ApiKeys</div>,
}));
vi.mock("@/domains/organization/components/organization-members", () => ({
  OrganizationMembers: () => <div data-testid="panel">OrganizationMembers</div>,
}));
vi.mock("@/domains/organization/components/organization-profile", () => ({
  OrganizationProfile: () => <div data-testid="panel">OrganizationProfile</div>,
}));
vi.mock("@/domains/organization/components/your-organizations", () => ({
  YourOrganizations: () => <div data-testid="panel">YourOrganizations</div>,
}));
vi.mock("@/domains/settings/components/settings-appearance-section", () => ({
  SettingsAppearanceSection: () => (
    <div data-testid="panel">SettingsAppearanceSection</div>
  ),
}));
vi.mock("@/domains/settings/components/settings-credentials-form", () => ({
  SettingsCredentialsForm: () => (
    <div data-testid="panel">SettingsCredentialsForm</div>
  ),
}));
vi.mock("@/domains/settings/components/settings-users", () => ({
  SettingsUsers: () => <div data-testid="panel">SettingsUsers</div>,
}));

import { Route as ProtectedRoute } from "@/routes/_protected";
import { Route as SettingsRoute } from "@/routes/_protected/settings/index";

const TABS: readonly [string, string, string][] = [
  ["Security", "security", "Settingssecurity"],
  ["Appearance", "appearance", "SettingsAppearanceSection"],
  ["API Keys", "api-keys", "ApiKeys"],
  ["Credentials", "credentials", "SettingsCredentialsForm"],
  ["Organizations", "organizations", "YourOrganizations"],
  ["General", "organization", "OrganizationProfile"],
  ["Members", "members", "OrganizationMembers"],
  ["Users", "users", "SettingsUsers"],
];

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
  const router = createRouter({
    routeTree: root.addChildren([protectedRoute.addChildren([settings])]),
    history,
    context: { queryClient: createAppQueryClient() },
  });
  render(<RouterProvider router={router} />);
  return { history };
}

describe("settings route tabs", () => {
  it.each(TABS)(
    "switches to %s on click and keeps the URL tab",
    async (label, tab, panel) => {
      const user = userEvent.setup();
      const { history } = renderSettingsAt("/settings");
      await user.click(await screen.findByRole("button", { name: label }));
      await waitFor(() => {
        expect(screen.getByTestId("panel")).toHaveTextContent(panel);
      });
      // The URL must STAY on the tab once the navigation has settled.
      await delay(200);
      expect(history.location.search).toBe(`?tab=${tab}`);
      expect(screen.getByTestId("panel")).toHaveTextContent(panel);
    }
  );

  it("strips an unusable tab from the URL once the route settles", async () => {
    const { history } = renderSettingsAt("/settings?tab=bogus");
    await screen.findByRole("button", { name: "Security" });
    await waitFor(() => {
      expect(history.location.search).toBe("");
    });
    expect(screen.getByTestId("panel")).toHaveTextContent("Settingsaccount");
  });
});
