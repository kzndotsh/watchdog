import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
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

// Only the network boundary is faked: the shell's sidebar reads the Case through the real
// cases-context query, seeded in the cache below.
vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
}));

import { AppShell } from "@/app/layout/app-shell";
import { casesKeys } from "@/domains/cases/queries";
import { buildCaseRecord } from "@/testing/records";

/** A real router with one catch-all route, so the sidebar's links build hrefs. */
function routerAt(pathname: string) {
  const root = createRootRoute();
  const all = createRoute({ getParentRoute: () => root, path: "$" });
  return createRouter({
    routeTree: root.addChildren([all]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
}

function renderShell() {
  const client = new QueryClient();
  const active = buildCaseRecord({ slug: "alpha" });
  client.setQueryData(casesKeys.context(), { cases: [active], active });
  return render(
    <RouterContextProvider router={routerAt("/cases/alpha")}>
      <QueryClientProvider client={client}>
        <AppShell>
          <p>Main content</p>
        </AppShell>
      </QueryClientProvider>
    </RouterContextProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

describe("AppShell", () => {
  it("renders the page content and the sidebar's navigation", async () => {
    renderShell();

    expect(screen.getByText("Main content")).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Collect" })
    ).toHaveAttribute("href", "/cases/alpha/collect");
  });

  it("offers a skip link that targets an element of the page", () => {
    const { container } = renderShell();

    const skip = screen.getByRole("link", { name: "Skip to main content" });
    const target = skip.getAttribute("href");
    expect(target).toBe("#app-main");
    expect(container.ownerDocument.querySelector("#app-main")).not.toBeNull();
  });
});
