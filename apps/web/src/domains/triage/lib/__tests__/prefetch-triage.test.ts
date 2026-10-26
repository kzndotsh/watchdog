import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { warmTriageQueries } from "@/domains/triage/lib/prefetch-triage";
import { proposalListView, proposalsKeys } from "@/domains/triage/queries";
import { proposalList } from "@watchdog/schemas/jobs";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

// Warm helpers fetch in the browser only; this node project stands in for it.
beforeEach(() => {
  vi.stubGlobal("window", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("warmTriageQueries", () => {
  it("warms the URL's first queue page and no Evidence list", async () => {
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
    expect(query).not.toHaveBeenCalled();
  });

  it("also warms the Proposal the URL selects, which the Detail reads by id", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);
    vi.spyOn(client, "infiniteQuery").mockResolvedValue({
      pages: [],
      pageParams: [],
    });

    const proposalId = testId(50);
    warmTriageQueries(client, testCaseId(10), {
      status: ["pending"],
      proposalId,
    });
    await Promise.resolve();

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: proposalsKeys.byId(testCaseId(10), proposalId),
      })
    );
  });
});
