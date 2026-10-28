import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { listDisplayStorageKey } from "@/shared/lib/list/list-display-store";

// The store caches each key's last snapshot for the page's lifetime, and a blocked write is kept
// only in that cache, so every test (and every repeat) gets a key of its own.
let run = 0;
let listKey = "";

beforeEach(() => {
  run += 1;
  listKey = `use-list-display-test-${run}`;
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.removeItem(listDisplayStorageKey(listKey));
});

describe("useListDisplay", () => {
  it("keeps a viewer's columns, toggles and density under wd.list.<key>", () => {
    const toggles = [{ id: "urls", label: "Show URLs", isDefaultOn: true }];
    const { result } = renderHook(() => useListDisplay(listKey, toggles));
    expect(result.current.isToggleOn("urls")).toBe(true);

    act(() => {
      result.current.setColumnVisible("notes", false);
      result.current.setToggle("urls", false);
    });
    act(() => {
      result.current.setDensity("compact");
    });
    expect(result.current.columnVisibility).toEqual({ notes: false });
    expect(result.current.isToggleOn("urls")).toBe(false);
    expect(result.current.density).toBe("compact");
    expect(
      window.localStorage.getItem(`wd.list.use-list-display-test-${run}`)
    ).toContain("compact");

    act(() => {
      result.current.resetColumns();
    });
    expect(result.current.columnVisibility).toEqual({});
  });

  it("keeps both changes made in one tick", () => {
    const { result } = renderHook(() => useListDisplay(listKey));
    act(() => {
      result.current.setColumnVisible("notes", false);
      result.current.setColumnVisible("added", false);
      result.current.setToggle("urls", true);
      result.current.setToggle("names", true);
    });
    expect(result.current.columnVisibility).toEqual({
      notes: false,
      added: false,
    });
    expect(result.current.isToggleOn("urls")).toBe(true);
    expect(result.current.isToggleOn("names")).toBe(true);
  });

  it("reads defaults from a malformed entry", () => {
    window.localStorage.setItem(listDisplayStorageKey(listKey), "{not json");
    const { result } = renderHook(() => useListDisplay(listKey));
    expect(result.current.density).toBe("comfortable");
  });

  it("keeps working, for this page, when storage throws", () => {
    // As a browser blocks it: reading `window.localStorage` itself throws. A spy on
    // `Storage.prototype` would outlive `restoreAllMocks` in happy-dom's storage proxy.
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const { result } = renderHook(() => useListDisplay(listKey));
    expect(result.current.density).toBe("comfortable");
    act(() => {
      result.current.setDensity("compact");
    });
    expect(result.current.density).toBe("compact");
  });
});
