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
  it("prefetches shared dossier lists, the Evidence pickers and entities for connections tab", () => {
    const client = new QueryClient();
    const prefetch = vi.spyOn(client, "query");
    const firstPages = vi
      .spyOn(client, "infiniteQuery")
      .mockResolvedValue({ pages: [], pageParams: [] });

    warmDossierQueries(client, "case-1", "entity-1", "connections");

    expect(prefetch).toHaveBeenCalledTimes(9);
    // The Identifiers and Evidence tab counts: one first page each.
    expect(firstPages.mock.calls.map(([query]) => query.queryKey[0])).toEqual([
      "identifiers",
      "evidence",
    ]);
    expect(
      prefetch.mock.calls.some(([query]) => query.queryKey[0] === "entities")
    ).toBe(true);
  });

  it("skips entities and the Case's Evidence for a tab without pickers", () => {
    const client = new QueryClient();
    const prefetch = vi.spyOn(client, "query");
    vi.spyOn(client, "infiniteQuery").mockResolvedValue({
      pages: [],
      pageParams: [],
    });

    warmDossierQueries(client, "case-1", "entity-1", "notes");

    expect(prefetch).toHaveBeenCalledTimes(6);
    expect(
      prefetch.mock.calls.some(([query]) =>
        ["entities", "evidence"].includes(String(query.queryKey[0]))
      )
    ).toBe(false);
  });
});
