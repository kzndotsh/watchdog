import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePatchSearch } from "@/shared/hooks/list/use-patch-search";
import { createTestRouter, testRouterWrapper } from "@/testing/test-router";

describe("usePatchSearch", () => {
  it("merges each patch into the URL with a history replace, and undefined removes a param", async () => {
    const router = createTestRouter();
    await router.load();
    const { result } = renderHook(() => usePatchSearch(), {
      wrapper: testRouterWrapper(router),
    });
    const entries = router.history.length;

    act(() => {
      result.current({ kind: ["file"] });
    });
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ kind: ["file"] });
    });
    act(() => {
      result.current({ q: "acme" });
    });
    await waitFor(() => {
      expect(router.state.location.search).toEqual({
        kind: ["file"],
        q: "acme",
      });
    });
    act(() => {
      result.current({ kind: undefined });
    });
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: "acme" });
    });
    // Typing and filtering never add Back entries.
    expect(router.history.length).toBe(entries);
  });
});
