import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const openPaletteMock = vi.hoisted(() => vi.fn());

vi.mock("@/domains/search/hooks/use-search-ui", () => ({
  useSearchUi: () => ({ openPalette: openPaletteMock }),
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenuButton: ({
    children,
    onClick,
    tooltip,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    tooltip?: string;
  }) => (
    <button type="button" aria-label={tooltip} onClick={onClick}>
      {children}
    </button>
  ),
  useSidebar: () => ({ state: "expanded", isMobile: false }),
}));

import { CommandSearchTrigger } from "@/domains/search/components/command-search-trigger";

describe("CommandSearchTrigger", () => {
  it("renders the search label when the sidebar is expanded", () => {
    render(<CommandSearchTrigger />);
    expect(screen.getByText("Search…")).toBeInTheDocument();
  });

  it("opens the command palette when clicked", async () => {
    render(<CommandSearchTrigger />);
    await screen.getByRole("button", { name: "Search" }).click();
    expect(openPaletteMock).toHaveBeenCalledTimes(1);
  });
});
