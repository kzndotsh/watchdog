import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

vi.mock("@/domains/tasks/tasks.functions", () => ({
  listTasksFn: vi.fn(),
}));

import { tasksKeys, tasksListQuery } from "@/domains/tasks/queries";

describe("tasks queries", () => {
  it("builds case-scoped task keys", () => {
    expect(tasksKeys.all("case-1")).toEqual(["tasks", "case-1"]);
    expect(tasksKeys.list("case-1", { status: "in_progress" })).toEqual([
      "tasks",
      "case-1",
      { status: "in_progress" },
    ]);
  });

  it("uses default stale and gc tiers for task lists", () => {
    expect(tasksListQuery("case-1")).toMatchObject({
      queryKey: tasksKeys.list("case-1"),
      enabled: false,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
  });

  it("keeps placeholder data only for the same task filter key", () => {
    const allTasks = tasksListQuery("case-1");
    const entityTasks = tasksListQuery("case-1", { entityId: "ent-1" });
    const allPlaceholder = allTasks.placeholderData;
    const entityPlaceholder = entityTasks.placeholderData;
    expect(typeof allPlaceholder).toBe("function");
    expect(typeof entityPlaceholder).toBe("function");
    if (
      typeof allPlaceholder !== "function" ||
      typeof entityPlaceholder !== "function"
    ) {
      return;
    }

    const previousData = [{ id: "task-1" }] as never;
    const allQuery = { queryKey: tasksKeys.list("case-1") };
    const entityQuery = {
      queryKey: tasksKeys.list("case-1", { entityId: "ent-1" }),
    };

    expect(allPlaceholder(previousData, allQuery as never)).toEqual(
      previousData
    );
    expect(allPlaceholder(previousData, entityQuery as never)).toBeUndefined();
    expect(entityPlaceholder(previousData, entityQuery as never)).toEqual(
      previousData
    );
    expect(entityPlaceholder(previousData, allQuery as never)).toBeUndefined();
  });
});
