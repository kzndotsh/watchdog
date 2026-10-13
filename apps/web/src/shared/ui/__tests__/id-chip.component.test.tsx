import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IdChip } from "@/shared/ui/id-chip";

describe("IdChip", () => {
  afterEach(() => {
    // Order matters: spies on window.setTimeout / cancelAnimationFrame are
    // created while fake timers are installed, so their "original" is the
    // fake. Restoring them after useRealTimers() would reinstall the fake
    // timers for every later file in this shared worker (5s waitFor hangs).
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("middle-truncates opaque ids", () => {
    render(<IdChip value="abcdef1234567890abcdef1234567890" />);
    expect(screen.getByText(/abcdef12/)).toBeInTheDocument();
    expect(screen.getByText(/67890/)).toBeInTheDocument();
  });

  it("copies the full value when copyable", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    render(<IdChip value="copy-me" isCopyable />);
    await user.click(screen.getByRole("button", { name: "Copy id" }));

    expect(writeText).toHaveBeenCalledWith("copy-me");
    vi.unstubAllGlobals();
  });

  it("leaves no copy-feedback timer pending after unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    const { unmount } = render(<IdChip value="copy-me" isCopyable />);
    await user.click(screen.getByRole("button", { name: "Copy id" }));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("schedules nothing when the clipboard write resolves after unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // observed below
    });
    const onCopied = vi.fn();
    let resolveWrite: () => void = () => {
      throw new Error("write not started");
    };
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: {
        writeText: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveWrite = resolve;
            })
        ),
      },
    });

    const { unmount } = render(
      <IdChip value="copy-me" isCopyable onCopied={onCopied} />
    );
    await user.click(screen.getByRole("button", { name: "Copy id" }));
    unmount();
    resolveWrite();
    await Promise.resolve();
    await Promise.resolve();

    expect(vi.getTimerCount()).toBe(0);
    expect(onCopied).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
