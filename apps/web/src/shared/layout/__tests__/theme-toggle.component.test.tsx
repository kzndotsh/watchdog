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

vi.mock("@watchdog/ui/components/dropdown-menu", () => ({
  DropdownMenuItem: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

import { ThemeMenuItem } from "@/shared/layout/theme-toggle";

describe("ThemeMenuItem", () => {
  it("cycles theme mode and persists the choice", () => {
    window.localStorage.clear();
    render(<ThemeMenuItem />);

    const button = screen.getByRole("button", {
      name: /Theme mode: auto \(system\)/,
    });
    expect(screen.getByText("System")).toBeInTheDocument();

    fireEvent.click(button);
    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(screen.getByText("Light")).toBeInTheDocument();
  });
});
