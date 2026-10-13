import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppAction } from "@/shared/lib/app-action";
import {
  getPaletteCommandsSnapshot,
  getServerPaletteCommandsSnapshot,
  registerPaletteSource,
  resetPaletteCommands,
  subscribePaletteCommands,
} from "@/shared/lib/palette-commands-store";

function action(id: string): AppAction {
  return { id, label: id, group: "page", run: vi.fn() };
}

afterEach(() => {
  resetPaletteCommands();
});

describe("palette commands store", () => {
  it("keeps snapshot identity stable until a registration changes", () => {
    const before = getPaletteCommandsSnapshot();
    expect(getPaletteCommandsSnapshot()).toBe(before);
    registerPaletteSource("a", [action("one")]);
    const after = getPaletteCommandsSnapshot();
    expect(after).not.toBe(before);
    expect(getPaletteCommandsSnapshot()).toBe(after);
    expect(after.map((a) => a.id)).toEqual(["one"]);
  });

  it("serves an empty snapshot on the server", () => {
    registerPaletteSource("a", [action("one")]);
    expect(getServerPaletteCommandsSnapshot()).toEqual([]);
  });

  it("notifies on register and unregister until unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePaletteCommands(listener);
    const unregister = registerPaletteSource("a", [action("one")]);
    expect(listener).toHaveBeenCalledTimes(1);
    unregister();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getPaletteCommandsSnapshot()).toEqual([]);

    unsubscribe();
    registerPaletteSource("b", [action("two")]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("merges sources and replaces a source registered twice", () => {
    registerPaletteSource("a", [action("one")]);
    registerPaletteSource("b", [action("two")]);
    registerPaletteSource("a", [action("three")]);
    expect(getPaletteCommandsSnapshot().map((a) => a.id)).toEqual([
      "three",
      "two",
    ]);
  });
});
