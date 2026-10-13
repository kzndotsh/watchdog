import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLiveRegion } from "@/domains/tasks/hooks/use-live-region";

function LiveRegionProbe() {
  const { announce, liveRegion } = useLiveRegion();
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          announce("Saved task");
        }}
      >
        Announce
      </button>
      {liveRegion}
    </div>
  );
}

describe("useLiveRegion", () => {
  afterEach(() => {
    // Order matters: spies on window.setTimeout / cancelAnimationFrame are
    // created while fake timers are installed, so their "original" is the
    // fake. Restoring them after useRealTimers() would reinstall the fake
    // timers for every later file in this shared worker (5s waitFor hangs).
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("cancels the pending frame on unmount", async () => {
    vi.useFakeTimers();
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const { unmount } = render(<LiveRegionProbe />);
    await act(async () => {
      screen.getByRole("button", { name: "Announce" }).click();
    });
    unmount();
    expect(cancel).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the pending timeout on unmount once announced", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<LiveRegionProbe />);
    await act(async () => {
      screen.getByRole("button", { name: "Announce" }).click();
    });
    await act(async () => {
      await vi.advanceTimersToNextTimerAsync();
    });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("announces messages in a polite live region", async () => {
    vi.useFakeTimers();
    render(<LiveRegionProbe />);
    await act(async () => {
      screen.getByRole("button", { name: "Announce" }).click();
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(screen.getByText("Saved task")).toHaveAttribute(
      "aria-live",
      "polite"
    );
    vi.useRealTimers();
  });
});
