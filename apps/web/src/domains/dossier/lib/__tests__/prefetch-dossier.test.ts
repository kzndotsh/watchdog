import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { warmDossierQueries } from "@/domains/dossier/lib/prefetch-dossier";
import { tasksKeys } from "@/domains/tasks/queries";

/** A key's domain: its first segment, or the first part of an oRPC key's procedure path. */
function keyRoot(queryKey: readonly unknown[]): string {
  const [head] = queryKey;
  return String(Array.isArray(head) ? head[0] : head);
}

// Warm helpers fetch in the browser only; this node project stands in for it.
beforeEach(() => {
  vi.stubGlobal("window", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("warmDossierQueries", () => {
  it("warms one first page of each list tab, the ego graph and the board, and nothing Case-wide", () => {
    const client = new QueryClient();
    const prefetch = vi.spyOn(client, "query");
    const firstPages = vi
      .spyOn(client, "infiniteQuery")
      .mockResolvedValue({ pages: [], pageParams: [] });

    warmDossierQueries(client, "case-1", "entity-1");

    // Two single reads: the ego graph's capped star and the Tasks board.
    expect(prefetch.mock.calls.map(([query]) => query.queryKey[0])).toEqual([
      ["graph", "ego"],
      ["tasks", "board"],
    ]);
    // Each list tab's count and first view: one first page each, never every page (#585).
    expect(firstPages.mock.calls.map(([query]) => query.queryKey[0])).toEqual([
      ["claims", "list"],
      ["identifiers", "list"],
      ["edges", "list"],
      ["evidence", "list"],
      ["events", "list"],
      ["questions", "list"],
    ]);
    // The Tasks tab: the board for this Entity only, never the Case's Task list (#569).
    const taskReads = prefetch.mock.calls
      .map(([query]) => query.queryKey)
      .filter((key) => keyRoot(key) === "tasks");
    expect(taskReads).toEqual([
      tasksKeys.board("case-1", { entityId: "entity-1" }),
    ]);
    // No whole-Case Entity or Evidence read (#559): the pickers search on the server.
    expect(
      prefetch.mock.calls.some(([query]) =>
        ["entities", "evidence"].includes(keyRoot(query.queryKey))
      )
    ).toBe(false);
  });
});
