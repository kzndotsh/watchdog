import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_DISPLAY_SCALE,
  DISPLAY_SCALE_STORAGE_KEY,
  applyDisplayScale,
  normalizeDisplayScale,
  persistDisplayScale,
} from "@/shared/lib/display-scale";

describe("normalizeDisplayScale", () => {
  it("returns allowed presets unchanged", () => {
    expect(normalizeDisplayScale(1.1)).toBe(1.1);
    expect(normalizeDisplayScale(1.2)).toBe(1.2);
    expect(normalizeDisplayScale(1.35)).toBe(1.35);
    expect(normalizeDisplayScale("1.2")).toBe(1.2);
  });

  it("defaults invalid values to the product default", () => {
    expect(normalizeDisplayScale(null)).toBe(DEFAULT_DISPLAY_SCALE);
    expect(normalizeDisplayScale(undefined)).toBe(DEFAULT_DISPLAY_SCALE);
    expect(normalizeDisplayScale("")).toBe(DEFAULT_DISPLAY_SCALE);
    expect(normalizeDisplayScale("nope")).toBe(DEFAULT_DISPLAY_SCALE);
    expect(normalizeDisplayScale(1)).toBe(DEFAULT_DISPLAY_SCALE);
    expect(normalizeDisplayScale(0.9)).toBe(DEFAULT_DISPLAY_SCALE);
    expect(normalizeDisplayScale(1.5)).toBe(DEFAULT_DISPLAY_SCALE);
    expect(normalizeDisplayScale(0.85)).toBe(DEFAULT_DISPLAY_SCALE);
  });
});

describe("display scale persistence", () => {
  afterEach(() => {
    window.localStorage.removeItem(DISPLAY_SCALE_STORAGE_KEY);
    document.documentElement.style.removeProperty("--wd-display-scale");
    delete document.documentElement.dataset.displayScale;
  });

  it("applies and persists allowed values", () => {
    persistDisplayScale(1.35);

    expect(window.localStorage.getItem(DISPLAY_SCALE_STORAGE_KEY)).toBe("1.35");
    expect(
      document.documentElement.style.getPropertyValue("--wd-display-scale")
    ).toBe("1.35");
    expect(document.documentElement.dataset.displayScale).toBe("1.35");
  });

  it("applyDisplayScale sets css variable and data attribute", () => {
    applyDisplayScale(1.1);

    expect(
      document.documentElement.style.getPropertyValue("--wd-display-scale")
    ).toBe("1.1");
    expect(document.documentElement.dataset.displayScale).toBe("1.1");
  });
});
