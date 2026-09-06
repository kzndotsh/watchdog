import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActionShortcutChord } from "../action-list.tsx";

describe("ActionShortcutChord", () => {
  it("renders Mod chords as separate Kbd keys", () => {
    vi.stubGlobal("navigator", { platform: "Linux", userAgent: "Linux" });
    render(<ActionShortcutChord chord="Mod+K" />);
    expect(screen.getByText("Ctrl")).toBeInTheDocument();
    expect(screen.getByText("K")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders bare keys as a single Kbd", () => {
    render(<ActionShortcutChord chord="?" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
