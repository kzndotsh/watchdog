import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { warmDossierQueries } from "@/domains/dossier/lib/prefetch-dossier";
import { tasksKeys } from "@/domains/tasks/queries";

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
      "edges",
      "tasks",
    ]);
    // Each list tab's count and first view: one first page each, never every page (#585).
    expect(firstPages.mock.calls.map(([query]) => query.queryKey[0])).toEqual([
      "claims",
      "identifiers",
      "edges",
      "evidence",
      "events",
      "questions",
    ]);
    // The Tasks tab: the board for this Entity only, never the Case's Task list (#569).
    const taskReads = prefetch.mock.calls
      .map(([query]) => query.queryKey)
      .filter((key) => key[0] === "tasks");
    expect(taskReads).toEqual([
      tasksKeys.board("case-1", { entityId: "entity-1" }),
    ]);
    // No whole-Case Entity or Evidence read (#559): the pickers search on the server.
    expect(
      prefetch.mock.calls.some(([query]) =>
        ["entities", "evidence"].includes(String(query.queryKey[0]))
      )
    ).toBe(false);
  });
});
