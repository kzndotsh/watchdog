// @vitest-environment jsdom
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CaseNavLinks } from "@/shared/layout/case-nav-links";
import { SidebarProvider } from "@watchdog/ui/components/sidebar";

/** A real router with the Case routes the nav links to, opened at `href`. */
async function renderNavAt(href: string) {
  const root = createRootRoute();
  const caseRoute = createRoute({
    getParentRoute: () => root,
    path: "/cases/$caseSlug",
  });
  const entities = createRoute({
    getParentRoute: () => caseRoute,
    path: "entities",
  });
  const router = createRouter({
    routeTree: root.addChildren([caseRoute.addChildren([entities])]),
    history: createMemoryHistory({ initialEntries: [href] }),
  });
  await router.load();
  render(
    <RouterContextProvider router={router}>
      <SidebarProvider>
        <CaseNavLinks caseSlug="alpha" isCollapsed={false} />
      </SidebarProvider>
    </RouterContextProvider>
  );
}

function isActive(name: string): boolean {
  return Object.hasOwn(screen.getByRole("link", { name }).dataset, "active");
}

describe("CaseNavLinks active link", () => {
  beforeEach(() => {
    // The sidebar provider reads the viewport; restored by `unstubGlobals` in the vitest config.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
  });

  it("marks the Overview on the Case's own URL only", async () => {
    await renderNavAt("/cases/alpha");
    await waitFor(() => {
      expect(isActive("Overview")).toBe(true);
    });
    expect(isActive("Entities")).toBe(false);
  });

  it("marks a Work screen on it and below it, not the Overview", async () => {
    await renderNavAt("/cases/alpha/entities");
    await waitFor(() => {
      expect(isActive("Entities")).toBe(true);
    });
    expect(isActive("Overview")).toBe(false);
  });
});
