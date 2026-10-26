import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useListSelection } from "@/shared/hooks/list/use-list-selection";

describe("useListSelection", () => {
  it("drops the selection on a view change, and going back does not bring it back", () => {
    const { result, rerender } = renderHook(
      ({ viewKey }) => useListSelection(viewKey),
      { initialProps: { viewKey: "all" } }
    );
    act(() => {
      result.current.toggle("row-1");
    });
    expect([...result.current.ids]).toEqual(["row-1"]);

    // Apply a filter, then remove it: the view is the original one again.
    rerender({ viewKey: "filtered" });
    expect(result.current.ids.size).toBe(0);
    rerender({ viewKey: "all" });
    expect(result.current.ids.size).toBe(0);
  });

  it("keeps both toggles made in one tick", () => {
    const { result } = renderHook(() => useListSelection("all"));
    act(() => {
      result.current.toggle("a");
      result.current.toggle("b");
    });
    expect([...result.current.ids].sort()).toEqual(["a", "b"]);
  });
});
