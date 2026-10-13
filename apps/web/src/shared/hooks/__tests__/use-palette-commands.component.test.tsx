import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppAction } from "@/shared/lib/app-action";
import {
  resetPaletteCommands,
  usePaletteCommands,
  useRegisteredPaletteCommands,
} from "@/shared/lib/palette-commands";

function action(id: string, run = vi.fn()): AppAction {
  return { id, label: id, group: "page", run };
}

afterEach(() => {
  resetPaletteCommands();
});

describe("usePaletteCommands", () => {
  it("shows commands while mounted and drops them on unmount", () => {
    const registered = renderHook(() => useRegisteredPaletteCommands());
    const actions = [action("new-task")];
    const page = renderHook(() => {
      usePaletteCommands(actions);
    });
    expect(registered.result.current.map((a) => a.id)).toEqual(["new-task"]);

    page.unmount();
    expect(registered.result.current).toEqual([]);
  });

  it("runs the latest closure without re-registering", () => {
    const registered = renderHook(() => useRegisteredPaletteCommands());
    const first = vi.fn();
    const second = vi.fn();
    const page = renderHook(
      ({ run }) => {
        usePaletteCommands([action("go", run)]);
      },
      { initialProps: { run: first } }
    );
    page.rerender({ run: second });
    act(() => {
      registered.result.current[0]?.run();
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("filters out actions not meant for the palette", () => {
    const registered = renderHook(() => useRegisteredPaletteCommands());
    const actions: AppAction[] = [
      { ...action("row-only"), group: "target" },
      action("page-cmd"),
    ];
    renderHook(() => {
      usePaletteCommands(actions);
    });
    expect(registered.result.current.map((a) => a.id)).toEqual(["page-cmd"]);
  });
});
