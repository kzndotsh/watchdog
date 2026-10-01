import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
  }) => (
    <button type="button" aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/shared/ui/timestamp", () => ({
  WithTooltip: ({ children }: { children: React.ReactNode }) => children,
}));

import { SearchButton } from "@/domains/search/components/search-button";
import {
  SearchUiContext,
  type SearchUiValue,
} from "@/domains/search/hooks/use-search-ui";

function searchUi(openPalette: () => void): SearchUiValue {
  return {
    openPalette,
    togglePalette: vi.fn(),
    openShortcuts: vi.fn(),
    chromeActions: [],
    paletteCommands: [],
  };
}

describe("SearchButton", () => {
  it("opens the command palette when clicked", () => {
    const openPalette = vi.fn();
    const value = searchUi(openPalette);
    render(
      <SearchUiContext.Provider value={value}>
        <SearchButton />
      </SearchUiContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(openPalette).toHaveBeenCalledTimes(1);
  });

  it("renders nothing outside the search chrome", () => {
    const { container } = render(<SearchButton />);
    expect(container).toBeEmptyDOMElement();
  });
});
