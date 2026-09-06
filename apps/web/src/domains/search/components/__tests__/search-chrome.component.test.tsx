import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSearchUi } from "@/domains/search/hooks/use-search-ui";

const useGlobalHotkeysMock = vi.hoisted(() => vi.fn());
const toggleSidebarMock = vi.hoisted(() => vi.fn());

vi.mock("@/domains/search/components/command-palette", () => ({
  CommandPalette: ({ open }: { open: boolean }) =>
    open ? <div data-testid="palette-open">Palette</div> : null,
}));

vi.mock("@/domains/search/components/shortcuts-sheet", () => ({
  ShortcutsSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="shortcuts-open">Shortcuts</div> : null,
}));

vi.mock("@/shared/lib/use-global-hotkeys", () => ({
  useGlobalHotkeys: (...args: unknown[]) => useGlobalHotkeysMock(...args),
}));

vi.mock("@/shared/ui/shadcn/sidebar", () => ({
  useSidebar: () => ({ toggleSidebar: toggleSidebarMock }),
}));

import { SearchChrome } from "@/domains/search/components/search-chrome";

function SearchUiProbe() {
  const ui = useSearchUi();
  return (
    <div>
      <button type="button" onClick={ui.openPalette}>
        Open palette
      </button>
      <button type="button" onClick={ui.openShortcuts}>
        Open shortcuts
      </button>
      <span data-testid="chrome-ids">
        {ui.chromeActions.map((a) => a.id).join(",")}
      </span>
      <span data-testid="palette-ids">
        {ui.paletteCommands.map((a) => a.id).join(",")}
      </span>
    </div>
  );
}

describe("SearchChrome", () => {
  it("renders children and exposes search UI actions", async () => {
    render(
      <SearchChrome>
        <div>Workspace body</div>
        <SearchUiProbe />
      </SearchChrome>
    );

    expect(screen.getByText("Workspace body")).toBeInTheDocument();

    await screen.getByRole("button", { name: "Open palette" }).click();
    expect(screen.getByTestId("palette-open")).toBeInTheDocument();

    await screen.getByRole("button", { name: "Open shortcuts" }).click();
    expect(screen.getByTestId("shortcuts-open")).toBeInTheDocument();

    expect(screen.getByTestId("chrome-ids")).toHaveTextContent(
      "command-palette,toggle-sidebar,shortcuts"
    );
    expect(screen.getByTestId("palette-ids")).toHaveTextContent(
      "toggle-sidebar,shortcuts"
    );
  });

  it("registers global hotkey bindings for palette, sidebar, and shortcuts", () => {
    render(
      <SearchChrome>
        <div>Child</div>
      </SearchChrome>
    );

    const bindings = useGlobalHotkeysMock.mock.calls[0]?.[0] as {
      id: string;
    }[];
    expect(bindings.map((binding) => binding.id)).toEqual([
      "command-palette",
      "toggle-sidebar",
      "shortcuts",
    ]);
  });
});
