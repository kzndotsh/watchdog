import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COPIED_RESET_MS,
  copyText,
  useCopyText,
} from "@/shared/hooks/use-copy-text";
import { toast } from "@/shared/ui/toast";

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

function stubClipboard(writeText: () => Promise<void>) {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
}

describe("copyText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("toasts success and failure only when asked to", async () => {
    stubClipboard(async () => Promise.resolve());
    expect(await copyText("a", { success: "Copied" })).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Copied");

    stubClipboard(async () => Promise.reject(new Error("denied")));
    expect(await copyText("a")).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
    expect(
      await copyText("a", { failure: (error) => `Couldn't: ${String(error)}` })
    ).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Couldn't: Error: denied");
  });
});

describe("useCopyText", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the copied state for the reset delay, then clears it", async () => {
    vi.useFakeTimers();
    stubClipboard(async () => Promise.resolve());
    const { result } = renderHook(() => useCopyText());

    await act(async () => {
      await result.current.copy("x");
    });
    expect(result.current.isCopied).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COPIED_RESET_MS);
    });
    expect(result.current.isCopied).toBe(false);
  });

  it("stays uncopied when the write fails", async () => {
    stubClipboard(async () => Promise.reject(new Error("denied")));
    const { result } = renderHook(() => useCopyText());

    await act(async () => {
      await result.current.copy("x");
    });
    expect(result.current.isCopied).toBe(false);
  });
});
