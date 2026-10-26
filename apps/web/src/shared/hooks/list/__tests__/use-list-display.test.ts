import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { listDisplayStorageKey } from "@/shared/lib/list/list-display-store";

const KEY = "use-list-display-test";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.removeItem(listDisplayStorageKey(KEY));
});

describe("useListDisplay", () => {
  it("keeps a viewer's columns, toggles and density under wd.list.<key>", () => {
    const toggles = [{ id: "urls", label: "Show URLs", isDefaultOn: true }];
    const { result } = renderHook(() => useListDisplay(KEY, toggles));
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
      window.localStorage.getItem("wd.list.use-list-display-test")
    ).toContain("compact");

    act(() => {
      result.current.resetColumns();
    });
    expect(result.current.columnVisibility).toEqual({});
  });

  it("reads defaults from a malformed entry", () => {
    window.localStorage.setItem(listDisplayStorageKey(KEY), "{not json");
    const { result } = renderHook(() => useListDisplay(KEY));
    expect(result.current.density).toBe("comfortable");
  });

  it("keeps working, for this page, when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useListDisplay(KEY));
    expect(result.current.density).toBe("comfortable");
    act(() => {
      result.current.setDensity("compact");
    });
    expect(result.current.density).toBe("compact");
  });
});
