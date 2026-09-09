import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SettingsAppearancePanel } from "@/domains/settings/components/settings-appearance-panel";
import { DISPLAY_SCALE_STORAGE_KEY } from "@/shared/lib/display-scale";

describe("SettingsAppearancePanel", () => {
  afterEach(() => {
    window.localStorage.removeItem("theme");
    window.localStorage.removeItem(DISPLAY_SCALE_STORAGE_KEY);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.style.removeProperty("--wd-display-scale");
    delete document.documentElement.dataset.displayScale;
    delete document.documentElement.dataset.theme;
  });

  it("renders theme and display size controls", () => {
    render(<SettingsAppearancePanel />);

    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Display size")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Display size" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Default" })).toHaveAttribute(
      "data-pressed"
    );
  });

  it("persists display scale and applies the css variable", () => {
    render(<SettingsAppearancePanel />);

    fireEvent.click(screen.getByRole("button", { name: "Large" }));

    expect(window.localStorage.getItem(DISPLAY_SCALE_STORAGE_KEY)).toBe("1.35");
    expect(
      document.documentElement.style.getPropertyValue("--wd-display-scale")
    ).toBe("1.35");
  });

  it("persists theme mode when a radio option is selected", () => {
    render(<SettingsAppearancePanel />);

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
