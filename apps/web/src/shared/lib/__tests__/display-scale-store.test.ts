import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DISPLAY_SCALE,
  DISPLAY_SCALE_STORAGE_KEY,
} from "@/shared/lib/display-scale";
import {
  getDisplayScale,
  getServerDisplayScale,
  persistDisplayScale,
  subscribeToDisplayScale,
} from "@/shared/lib/display-scale-store";

afterEach(() => {
  window.localStorage.removeItem(DISPLAY_SCALE_STORAGE_KEY);
  document.documentElement.style.removeProperty("--wd-display-scale");
  delete document.documentElement.dataset.displayScale;
});

describe("display scale store", () => {
  it("snapshots the stored scale, defaulting when none is stored", () => {
    expect(getDisplayScale()).toBe(DEFAULT_DISPLAY_SCALE);
    expect(getDisplayScale()).toBe(getDisplayScale());
    window.localStorage.setItem(DISPLAY_SCALE_STORAGE_KEY, "1.2");
    expect(getDisplayScale()).toBe(1.2);
  });

  it("serves the default on the server", () => {
    expect(getServerDisplayScale()).toBe(DEFAULT_DISPLAY_SCALE);
  });

  it("notifies subscribers on persist until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToDisplayScale(listener);
    persistDisplayScale(1.35);
    expect(listener).toHaveBeenCalledOnce();
    expect(getDisplayScale()).toBe(1.35);

    unsubscribe();
    persistDisplayScale(1.2);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("notifies on cross-tab storage events and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToDisplayScale(listener);
    window.dispatchEvent(new Event("storage"));
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    window.dispatchEvent(new Event("storage"));
    expect(listener).toHaveBeenCalledOnce();
  });
});
