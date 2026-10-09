import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const createHotkeyListener = vi.hoisted(() => vi.fn(() => vi.fn()));

vi.mock("@/shared/lib/hotkeys", () => ({
  createHotkeyListener,
}));

import { useGlobalHotkeys } from "@/shared/hooks/use-global-hotkeys";

describe("useGlobalHotkeys", () => {
  it("registers a window keydown listener via createHotkeyListener", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => {
      useGlobalHotkeys([
        {
          id: "palette",
          key: "k",
          mod: true,
          run: vi.fn(),
        },
      ]);
    });
    expect(createHotkeyListener).toHaveBeenCalled();
    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
