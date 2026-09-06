import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  SearchUiContext,
  useSearchUi,
} from "@/domains/search/hooks/use-search-ui";

function SearchUiProbe() {
  const ui = useSearchUi();
  return (
    <button type="button" onClick={ui.openPalette}>
      Open
    </button>
  );
}

describe("useSearchUi", () => {
  it("throws when used outside SearchChrome", () => {
    expect(() => render(<SearchUiProbe />)).toThrow(
      /useSearchUi must be used within SearchChrome/
    );
  });

  it("returns palette actions from context", () => {
    const value = {
      openPalette: vi.fn(),
      togglePalette: vi.fn(),
      openShortcuts: vi.fn(),
      chromeActions: [],
      paletteCommands: [],
    };
    render(
      <SearchUiContext value={value}>
        <SearchUiProbe />
      </SearchUiContext>
    );
    screen.getByRole("button", { name: "Open" }).click();
    expect(value.openPalette).toHaveBeenCalledTimes(1);
  });
});
