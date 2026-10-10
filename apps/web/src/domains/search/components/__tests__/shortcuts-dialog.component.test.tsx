import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShortcutsDialog } from "@/domains/search/components/shortcuts-dialog";
import { HOTKEYS } from "@/shared/lib/hotkeys";

describe("ShortcutsDialog", () => {
  it("lists keyboard shortcut catalog entries when open", () => {
    render(<ShortcutsDialog open onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Shortcuts" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ctrl K then type to search the Active Case or jump to a page."
      )
    ).toBeInTheDocument();

    for (const entry of HOTKEYS) {
      expect(screen.getAllByText(entry.label).length).toBeGreaterThan(0);
      expect(screen.getByText(entry.description)).toBeInTheDocument();
    }
  });

  it("shows the platform mod-key label in the description, never the literal Mod+", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    render(<ShortcutsDialog open onOpenChange={vi.fn()} />);

    const description = screen.getByText(/then type to search/);
    expect(description.textContent).toBe(
      "⌘ K then type to search the Active Case or jump to a page."
    );
    expect(description.textContent).not.toContain("Mod+");
    vi.restoreAllMocks();
  });
});
