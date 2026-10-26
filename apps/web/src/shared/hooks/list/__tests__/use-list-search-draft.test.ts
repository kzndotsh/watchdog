import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useListSearchDraft } from "@/shared/hooks/list/use-list-search-draft";
import { LIST_SEARCH_DEBOUNCE_MS } from "@/shared/lib/debounce";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(initialQ: string | null = null) {
  const onCommit = vi.fn();
  const hook = renderHook(({ urlQ }) => useListSearchDraft(urlQ, onCommit), {
    initialProps: { urlQ: initialQ },
  });
  return { ...hook, onCommit };
}

describe("useListSearchDraft", () => {
  it("writes the settled text once, after the debounce", async () => {
    const { result, onCommit } = setup();
    act(() => {
      result.current.setFocused(true);
      result.current.setText("acm");
    });
    act(() => {
      result.current.setText("acme");
    });
    expect(onCommit).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIST_SEARCH_DEBOUNCE_MS);
    });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("acme");
  });

  it("never writes 1 or 2 characters, and writes empty to drop q", async () => {
    const { result, onCommit } = setup("acme");
    act(() => {
      result.current.setFocused(true);
      result.current.setText("ac");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIST_SEARCH_DEBOUNCE_MS);
    });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      result.current.clear();
    });
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it("keeps the typed text while focused, and re-bases on the URL once unfocused", async () => {
    const { result, rerender } = setup(null);
    act(() => {
      result.current.setFocused(true);
      result.current.setText("draft");
    });
    rerender({ urlQ: "other" });
    expect(result.current.text).toBe("draft");

    const unfocused = setup("one");
    unfocused.rerender({ urlQ: "two" });
    expect(unfocused.result.current.text).toBe("two");
  });
});
