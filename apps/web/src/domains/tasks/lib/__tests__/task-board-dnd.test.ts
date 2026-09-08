import { describe, expect, it } from "vitest";

import { TASK_STATUSES } from "@watchdog/schemas";

import type { TaskRecord } from "../../types.ts";
import {
  dropSlotIndex,
  emptyColumns,
  groupByStatus,
  insertAfterOver,
  insertAtColumnIndex,
  mergeEntityScopedColumnOrder,
  reconcileItems,
  resolveDropOverId,
} from "../task-board-dnd.ts";

function task(
  id: string,
  status: TaskRecord["status"],
  opts?: { title?: string; entityId?: string | null }
): TaskRecord {
  const title = opts?.title ?? id;
  return {
    id,
    caseId: "11111111-1111-4111-8111-111111111111",
    entityId: opts?.entityId ?? null,
    title,
    description: null,
    status,
    priority: null,
    dueDate: null,
    position: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("task-board-dnd", () => {
  it("emptyColumns has every TASK_STATUSES column", () => {
    const cols = emptyColumns();
    expect(Object.keys(cols).sort()).toEqual([...TASK_STATUSES].sort());
  });

  it("reconcileItems keeps optimistic column when the server lags", () => {
    const prev = [task("a", "in_progress"), task("b", "backlog")];
    const next = [task("a", "backlog"), task("b", "backlog")];
    const merged = reconcileItems(prev, next);
    expect(merged.find((t) => t.id === "a")?.status).toBe("in_progress");
  });

  it("insertAfterOver flips when the overlay center crosses the card midpoint", () => {
    expect(insertAfterOver(0, 0, 40, 40)).toBe(false);
    expect(insertAfterOver(1, 0, 40, 40)).toBe(true);
    expect(insertAfterOver(undefined, 0, 40, 40)).toBe(false);
  });

  it("dropSlotIndex is before the hovered card, after when past midpoint", () => {
    expect(dropSlotIndex("b", [{ id: "b" }, { id: "c" }], false)).toBe(0);
    expect(dropSlotIndex("b", [{ id: "b" }, { id: "c" }], true)).toBe(1);
  });

  it("insertAtColumnIndex puts the card at the drop slot", () => {
    const prev = [
      task("a", "backlog"),
      task("b", "in_progress"),
      task("c", "in_progress"),
    ];
    const next = insertAtColumnIndex(
      prev,
      "a",
      { ...task("a", "in_progress") },
      "in_progress",
      1
    );
    expect(groupByStatus(next).in_progress.map((t) => t.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("resolveDropOverId falls back to the last hovered card", () => {
    expect(resolveDropOverId("a", "a", "b")).toBe("b");
    expect(resolveDropOverId("b", "a", "c")).toBe("b");
  });

  it("mergeEntityScopedColumnOrder preserves non-entity slots in the full column", () => {
    const all = [
      task("a", "in_progress", { entityId: "ent-1" }),
      task("b", "in_progress"),
      task("c", "in_progress", { entityId: "ent-1" }),
      task("d", "in_progress"),
    ];
    expect(
      mergeEntityScopedColumnOrder(all, "in_progress", "ent-1", ["c", "a"])
    ).toEqual(["c", "b", "a", "d"]);
  });

  it("mergeEntityScopedColumnOrder appends trailing entity tasks", () => {
    const all = [
      task("a", "backlog", { entityId: "ent-1" }),
      task("b", "backlog"),
      task("c", "backlog", { entityId: "ent-1" }),
    ];
    expect(
      mergeEntityScopedColumnOrder(all, "backlog", "ent-1", ["c"])
    ).toEqual(["c", "b", "a"]);
  });
});
