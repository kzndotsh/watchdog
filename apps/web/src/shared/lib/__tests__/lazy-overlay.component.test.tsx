import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { lazyOverlay } from "@/shared/lib/lazy-overlay";
import {
  memoizeImport,
  OVERLAY_PREFETCH_MS,
} from "@/shared/lib/preload-import";

function Panel({ open }: { open: boolean }) {
  return <p>{open ? "panel open" : "panel closed"}</p>;
}

function setup(options?: { shouldPrefetch?: boolean }) {
  const load = vi.fn(async () => Promise.resolve({ Panel }));
  const Overlay = lazyOverlay(
    memoizeImport(load),
    (module) => module.Panel,
    options
  );
  return { load, Overlay };
}

describe("lazyOverlay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads at the first open and stays mounted after a close", async () => {
    const { load, Overlay } = setup();
    const { rerender } = render(<Overlay open={false} />);
    expect(load).not.toHaveBeenCalled();

    rerender(<Overlay open />);
    expect(await screen.findByText("panel open")).toBeInTheDocument();

    rerender(<Overlay open={false} />);
    expect(screen.getByText("panel closed")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("prefetches its chunk after the shared delay without mounting", async () => {
    vi.useFakeTimers();
    const { load, Overlay } = setup({ shouldPrefetch: true });
    render(<Overlay open={false} />);
    expect(load).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(OVERLAY_PREFETCH_MS);
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("panel closed")).not.toBeInTheDocument();
  });
});
