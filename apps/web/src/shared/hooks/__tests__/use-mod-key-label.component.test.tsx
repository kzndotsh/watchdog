import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useModKeyLabel } from "@/shared/hooks/use-mod-key-label";

function Probe() {
  return <kbd>{useModKeyLabel()}</kbd>;
}

describe("useModKeyLabel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the command glyph on Apple platforms", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    render(<Probe />);
    expect(screen.getByText("⌘")).toBeInTheDocument();
  });

  it("shows Ctrl on other platforms", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    render(<Probe />);
    expect(screen.getByText("Ctrl")).toBeInTheDocument();
  });
});
