import { describe, expect, it, vi } from "vitest";

import {
  actionShowsOn,
  filterActionsForSurface,
  mergeActionLayers,
  shouldSeparateActions,
  type AppAction,
} from "../app-action.ts";

function action(
  partial: Pick<AppAction, "id" | "label" | "group"> &
    Partial<Omit<AppAction, "id" | "label" | "group" | "run">>
): AppAction {
  return {
    run: vi.fn(),
    ...partial,
  };
}

describe("app-action helpers", () => {
  it("defaults surfaces by group", () => {
    expect(
      actionShowsOn(
        action({ id: "t", label: "T", group: "target" }),
        "dropdown"
      )
    ).toBe(true);
    expect(
      actionShowsOn(action({ id: "t", label: "T", group: "target" }), "palette")
    ).toBe(false);
    expect(
      actionShowsOn(action({ id: "a", label: "A", group: "app" }), "palette")
    ).toBe(true);
  });

  it("separates groups and first destructive", () => {
    const open = action({ id: "open", label: "Open", group: "target" });
    const del = action({
      id: "del",
      label: "Delete",
      group: "target",
      destructive: true,
    });
    const app = action({ id: "app", label: "Search", group: "app" });
    expect(shouldSeparateActions(open, del)).toBe(true);
    expect(shouldSeparateActions(del, app)).toBe(true);
    expect(shouldSeparateActions(open, open)).toBe(false);
  });

  it("merges layers and filters surfaces", () => {
    const target = [action({ id: "t", label: "T", group: "target" })];
    const app = [
      action({ id: "search", label: "Search", group: "app" }),
      action({ id: "toggle", label: "Toggle", group: "app" }),
    ];
    const merged = mergeActionLayers(target, [], app);
    expect(filterActionsForSurface(merged, "palette").map((a) => a.id)).toEqual(
      ["search", "toggle"]
    );
    expect(filterActionsForSurface(merged, "context").map((a) => a.id)).toEqual(
      ["t", "search", "toggle"]
    );
    expect(
      filterActionsForSurface(target, "dropdown").map((a) => a.id)
    ).toEqual(["t"]);
  });
});
