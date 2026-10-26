import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { warmDossierQueries } from "@/domains/dossier/lib/prefetch-dossier";

// Warm helpers fetch in the browser only; this node project stands in for it.
beforeEach(() => {
  vi.stubGlobal("window", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("warmDossierQueries", () => {
  it("warms the Entity's own lists and the two tab counts, and nothing Case-wide", () => {
    const client = new QueryClient();
    const prefetch = vi.spyOn(client, "query");
    const firstPages = vi
      .spyOn(client, "infiniteQuery")
      .mockResolvedValue({ pages: [], pageParams: [] });

    warmDossierQueries(client, "case-1", "entity-1");

    expect(prefetch).toHaveBeenCalledTimes(6);
    // The Identifiers and Evidence tab counts: one first page each.
    expect(firstPages.mock.calls.map(([query]) => query.queryKey[0])).toEqual([
      "identifiers",
      "evidence",
    ]);
    // No whole-Case Entity or Evidence read (#559): the pickers search on the server.
    expect(
      prefetch.mock.calls.some(([query]) =>
        ["entities", "evidence"].includes(String(query.queryKey[0]))
      )
    ).toBe(false);
  });
});
