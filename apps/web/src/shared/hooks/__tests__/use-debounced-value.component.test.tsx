import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import {
  SEARCH_DEBOUNCE_MS,
  SLUG_CHECK_DEBOUNCE_MS,
} from "@/shared/lib/debounce";

function setup(input: string, waitMs: number) {
  return renderHook(({ value, wait }) => useDebouncedValue(value, wait, ""), {
    initialProps: { value: input, wait: waitMs },
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the initial value and stays unsettled until the wait elapses", async () => {
    const { result } = setup("abc", 250);
    expect(result.current).toEqual({ value: "", settled: false });
    await advance(249);
    expect(result.current).toEqual({ value: "", settled: false });
    await advance(1);
    expect(result.current).toEqual({ value: "abc", settled: true });
  });

  it("restarts the wait on every change and unsettles at once", async () => {
    const { result, rerender } = setup("a", 250);
    await advance(250);
    expect(result.current.isSettled).toBe(true);
    rerender({ value: "ab", wait: 250 });
    expect(result.current).toEqual({ value: "a", settled: false });
    await advance(200);
    rerender({ value: "abc", wait: 250 });
    await advance(200);
    expect(result.current).toEqual({ value: "a", settled: false });
    await advance(50);
    expect(result.current).toEqual({ value: "abc", settled: true });
  });

  it("treats a return to an earlier value as a change", async () => {
    const { result, rerender } = setup("a", 250);
    await advance(250);
    rerender({ value: "b", wait: 250 });
    await advance(100);
    rerender({ value: "a", wait: 250 });
    expect(result.current.isSettled).toBe(false);
    await advance(249);
    expect(result.current.isSettled).toBe(false);
    await advance(1);
    expect(result.current).toEqual({ value: "a", settled: true });
  });

  it("commits on the next tick when the wait is zero", async () => {
    const { result } = setup("x", 0);
    expect(result.current.isSettled).toBe(false);
    await advance(0);
    expect(result.current).toEqual({ value: "x", settled: true });
  });

  it("cancels the pending commit on unmount", async () => {
    const { result, unmount } = setup("abc", 250);
    unmount();
    await advance(500);
    expect(result.current).toEqual({ value: "", settled: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("names the delays in one place", () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(250);
    expect(SLUG_CHECK_DEBOUNCE_MS).toBe(400);
  });
});
