import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/domains/search/components/search-chrome", () => ({
  SearchChrome: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="search-chrome">{children}</div>
  ),
}));

vi.mock("@/domains/search/components/app-inset-context-menu", () => ({
  AppInsetContextMenu: ({ children }: { children: React.ReactNode }) => (
    <div id="app-main" data-testid="app-inset-context-menu">
      {children}
    </div>
  ),
}));

vi.mock("@/app/layout/app-sidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar">Sidebar</div>,
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarInset: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { AppShell } from "@/app/layout/app-shell";
import { createTestRouter, testRouterWrapper } from "@/testing/test-router";

describe("AppShell", () => {
  it("wraps page content with search chrome, sidebar, and skip link", () => {
    const Router = testRouterWrapper(createTestRouter());
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AppShell>
          <div>Main content</div>
        </AppShell>
      </QueryClientProvider>,
      { wrapper: Router }
    );

    expect(screen.getByTestId("search-chrome")).toBeInTheDocument();
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Skip to main content" })
    ).toHaveAttribute("href", "#app-main");
    expect(screen.getByText("Main content")).toBeInTheDocument();
  });
});
