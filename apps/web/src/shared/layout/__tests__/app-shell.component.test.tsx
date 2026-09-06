import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/domains/search/components/search-chrome", () => ({
  SearchChrome: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="search-chrome">{children}</div>
  ),
  AppInsetContextMenu: ({ children }: { children: React.ReactNode }) => (
    <div id="app-main" data-testid="app-inset-context-menu">
      {children}
    </div>
  ),
}));

vi.mock("@/shared/layout/app-sidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar">Sidebar</div>,
}));

vi.mock("@/shared/ui/shadcn/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarInset: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { AppShell } from "@/shared/layout/app-shell";

describe("AppShell", () => {
  it("wraps page content with search chrome, sidebar, and skip link", () => {
    render(
      <AppShell>
        <div>Main content</div>
      </AppShell>
    );

    expect(screen.getByTestId("search-chrome")).toBeInTheDocument();
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Skip to main content" })
    ).toHaveAttribute("href", "#app-main");
    expect(screen.getByText("Main content")).toBeInTheDocument();
  });
});
