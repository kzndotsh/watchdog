import { describe, expect, it, vi } from "vitest";

import {
  activeHeading,
  activeList,
  activeMarks,
  preventToolbarMouseDown,
} from "@/shared/ui/rich-text/rich-text-toolbar-controls.lib";

describe("rich-text-toolbar-controls.lib", () => {
  it("selects the first matching heading", () => {
    expect(activeHeading(true, true, true)).toEqual(["h1"]);
    expect(activeHeading(false, true, false)).toEqual(["h2"]);
    expect(activeHeading(false, false, true)).toEqual(["h3"]);
    expect(activeHeading(false, false, false)).toEqual([]);
  });

  it("collects active marks", () => {
    expect(activeMarks(true, false, true)).toEqual(["bold", "underline"]);
    expect(activeMarks(false, false, false)).toEqual([]);
  });

  it("selects the first matching list style", () => {
    expect(activeList(true, true)).toEqual(["ul"]);
    expect(activeList(false, true)).toEqual(["ol"]);
    expect(activeList(false, false)).toEqual([]);
  });

  it("prevents toolbar mousedown default", () => {
    const preventDefault = vi.fn();
    preventToolbarMouseDown({ preventDefault } as never);
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
