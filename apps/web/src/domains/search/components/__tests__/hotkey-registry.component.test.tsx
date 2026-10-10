import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSearchUi } from "@/domains/search/hooks/use-search-ui";
import {
  HOTKEYS,
  hotkeyDef,
  matchesChord,
  type HotkeyBinding,
} from "@/shared/lib/hotkeys";

const captured = vi.hoisted(() => ({
  bindings: [] as HotkeyBinding[],
}));
const toggleSidebarMock = vi.hoisted(() => vi.fn());

vi.mock("@/domains/search/components/command-palette", () => ({
  CommandPalette: () => null,
}));

vi.mock("@/shared/hooks/use-global-hotkeys", () => ({
  useGlobalHotkeys: (bindings: HotkeyBinding[]) => {
    captured.bindings = bindings;
  },
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  useSidebar: () => ({ toggleSidebar: toggleSidebarMock }),
}));

import { SearchChrome } from "@/domains/search/components/search-chrome";

function Probe() {
  const ui = useSearchUi();
  return (
    <div>
      <button type="button" onClick={ui.openShortcuts}>
        Open shortcuts
      </button>
      <span data-testid="palette-ids">
        {ui.paletteCommands.map((a) => a.id).join(",")}
      </span>
      <span data-testid="chrome-hotkeys">
        {ui.chromeActions.map((a) => a.hotkey).join(",")}
      </span>
    </div>
  );
}

function renderChrome() {
  render(
    <SearchChrome>
      <Probe />
    </SearchChrome>
  );
  act(() => {
    screen.getByRole("button", { name: "Open shortcuts" }).click();
  });
}

function keyEventFor(chord: string): KeyboardEvent {
  const mod = chord.startsWith("Mod+");
  return new KeyboardEvent("keydown", {
    key: mod ? chord.slice("Mod+".length) : chord,
    ctrlKey: mod,
  });
}

describe("one shortcut registry", () => {
  beforeEach(() => {
    captured.bindings = [];
    toggleSidebarMock.mockClear();
  });

  it("lists every registry id in the Shortcuts dialog", () => {
    renderChrome();
    const dialog = screen.getByRole("dialog");
    for (const entry of HOTKEYS) {
      expect(within(dialog).getByText(entry.description)).toBeInTheDocument();
    }
  });

  it("binds exactly the global registry ids, matching their registry chords", () => {
    renderChrome();
    const globalIds = HOTKEYS.filter((e) => e.owner === "global").map(
      (e) => e.id
    );
    expect(captured.bindings.map((b) => b.id)).toEqual(globalIds);

    for (const binding of captured.bindings) {
      const def = hotkeyDef(binding.id as (typeof HOTKEYS)[number]["id"]);
      expect(matchesChord(keyEventFor(def.chord), binding)).toBe(true);
      expect(binding.allowInEditable === true).toBe(
        "allowInEditable" in def && def.allowInEditable === true
      );
    }
  });

  it("leaves Mod+B and the other non-global owners to their own listeners", () => {
    renderChrome();
    const bound = new Set(captured.bindings.map((b) => b.id));
    for (const entry of HOTKEYS) {
      if (entry.owner !== "global") expect(bound.has(entry.id)).toBe(false);
    }
    expect(hotkeyDef("toggle-sidebar").owner).toBe("sidebar-provider");
  });

  it("derives palette commands and menu chords from registry ids", () => {
    renderChrome();
    const paletteIds = HOTKEYS.filter((e) => "palette" in e && e.palette).map(
      (e) => e.id
    );
    expect(screen.getByTestId("palette-ids")).toHaveTextContent(
      paletteIds.join(",")
    );
    for (const hotkey of screen
      .getByTestId("chrome-hotkeys")
      .textContent.split(",")) {
      expect(HOTKEYS.map((e) => e.id as string)).toContain(hotkey);
    }
  });
});
