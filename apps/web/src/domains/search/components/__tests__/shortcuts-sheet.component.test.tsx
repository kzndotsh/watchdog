import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShortcutsSheet } from "@/domains/search/components/shortcuts-sheet";
import { HOTKEYS } from "@/shared/lib/hotkeys";

describe("ShortcutsSheet", () => {
  it("lists keyboard shortcut catalog entries when open", () => {
    render(<ShortcutsSheet open onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Shortcuts" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Mod+K then type to search the Active Case or jump to a page."
      )
    ).toBeInTheDocument();

    for (const entry of HOTKEYS) {
      expect(screen.getAllByText(entry.label).length).toBeGreaterThan(0);
      expect(screen.getByText(entry.description)).toBeInTheDocument();
    }
  });
});
