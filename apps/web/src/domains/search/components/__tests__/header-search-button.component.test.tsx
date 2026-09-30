import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/ui/timestamp", () => ({
  WithTooltip: ({ children }: { children: React.ReactNode }) => children,
}));

import { HeaderSearchButton } from "@/domains/search/components/header-search-button";
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

describe("HeaderSearchButton", () => {
  it("opens the command palette when clicked", () => {
    const openPalette = vi.fn();
    const value = searchUi(openPalette);
    render(
      <SearchUiContext.Provider value={value}>
        <HeaderSearchButton />
      </SearchUiContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(openPalette).toHaveBeenCalledTimes(1);
  });

  it("renders nothing outside the search chrome", () => {
    const { container } = render(<HeaderSearchButton />);
    expect(container).toBeEmptyDOMElement();
  });
});
