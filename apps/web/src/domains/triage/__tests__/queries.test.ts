import { describe, expect, it, vi } from "vitest";

import { GC_REALTIME, STALE_REALTIME } from "@/shared/lib/query-stale";

vi.mock("@/domains/triage/triage.functions", () => ({
  listProposalsFn: vi.fn(),
}));

import {
  allProposalsQuery,
  proposalsByStatusQuery,
  proposalsKeys,
} from "@/domains/triage/queries";

describe("triage queries", () => {
  it("builds proposal status keys", () => {
    expect(proposalsKeys.all("case-1")).toEqual(["proposals", "case-1"]);
    expect(proposalsKeys.status("case-1", "pending")).toEqual([
      "proposals",
      "case-1",
      "pending",
    ]);
  });

  it("uses realtime tiers for proposal lists", () => {
    expect(proposalsByStatusQuery("case-1", "pending")).toMatchObject({
      queryKey: proposalsKeys.status("case-1", "pending"),
      staleTime: STALE_REALTIME,
      gcTime: GC_REALTIME,
    });
    expect(allProposalsQuery("case-1")).toMatchObject({
      queryKey: proposalsKeys.all("case-1"),
      staleTime: STALE_REALTIME,
      gcTime: GC_REALTIME,
    });
  });
});
