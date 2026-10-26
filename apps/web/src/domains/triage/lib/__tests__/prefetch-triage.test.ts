import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { evidenceListQuery } from "@/domains/intake/queries";
import { warmTriageQueries } from "@/domains/triage/lib/prefetch-triage";
import { proposalListView } from "@/domains/triage/queries";
import { proposalList } from "@watchdog/schemas/jobs";

// Warm helpers fetch in the browser only; this node project stands in for it.
beforeEach(() => {
  vi.stubGlobal("window", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("warmTriageQueries", () => {
  it("warms the URL's first queue page and prefetches evidence", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);
    const infiniteQuery = vi
      .spyOn(client, "infiniteQuery")
      .mockResolvedValue({ pages: [], pageParams: [] });

    const search = { status: ["pending"] as const, q: "lead" };
    warmTriageQueries(client, "case-1", search);
    await Promise.resolve();

    expect(infiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: proposalListView.key(
          { caseId: "case-1" },
          proposalList.queryOf(search)
        ),
      })
    );
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: evidenceListQuery("case-1").queryKey,
      })
    );
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: evidenceListQuery("case-1", { isHiddenOnly: true }).queryKey,
      })
    );
  });
});
