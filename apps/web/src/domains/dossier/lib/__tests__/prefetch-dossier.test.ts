import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

import { warmDossierQueries } from "@/domains/dossier/lib/prefetch-dossier";

describe("warmDossierQueries", () => {
  it("prefetches shared dossier lists and entities for connections tab", () => {
    const client = new QueryClient();
    const prefetch = vi.spyOn(client, "query");

    warmDossierQueries(client, "case-1", "entity-1", "connections");

    expect(prefetch).toHaveBeenCalledTimes(8);
    expect(
      prefetch.mock.calls.some(([query]) => query.queryKey[0] === "entities")
    ).toBe(true);
  });

  it("skips entities list prefetch for notes-only tab", () => {
    const client = new QueryClient();
    const prefetch = vi.spyOn(client, "query");

    warmDossierQueries(client, "case-1", "entity-1", "notes");

    expect(prefetch).toHaveBeenCalledTimes(7);
    expect(
      prefetch.mock.calls.some(([query]) => query.queryKey[0] === "entities")
    ).toBe(false);
  });
});
