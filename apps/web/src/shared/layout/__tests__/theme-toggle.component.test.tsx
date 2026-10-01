import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

import { modeLabel, useThemeMode } from "@/shared/layout/theme-toggle";

function ThemeProbe() {
  const { mode, toggleMode, ariaLabel } = useThemeMode();
  return (
    <button type="button" aria-label={ariaLabel} onClick={toggleMode}>
      {modeLabel(mode)}
    </button>
  );
}

describe("useThemeMode", () => {
  it("cycles theme mode and persists the choice", () => {
    window.localStorage.clear();
    render(<ThemeProbe />);

    const button = screen.getByRole("button", {
      name: /Theme mode: auto \(system\)/,
    });
    expect(screen.getByText("System")).toBeInTheDocument();

    fireEvent.click(button);
    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(screen.getByText("Light")).toBeInTheDocument();
  });
});
