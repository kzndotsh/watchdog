import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

import { evidenceListQuery } from "@/domains/intake/queries";
import { warmTriageQueries } from "@/domains/triage/lib/prefetch-triage";
import { allProposalsQuery } from "@/domains/triage/queries";

describe("warmTriageQueries", () => {
  it("revalidates proposals and prefetches evidence", () => {
    const ensureQueryData = vi.fn().mockResolvedValue(undefined);
    const prefetchQuery = vi.fn().mockResolvedValue(undefined);
    const client = { ensureQueryData, prefetchQuery } as unknown as QueryClient;

    warmTriageQueries(client, "case-1");

    expect(ensureQueryData).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: allProposalsQuery("case-1").queryKey,
        revalidateIfStale: true,
      })
    );
    expect(prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: evidenceListQuery("case-1").queryKey,
      })
    );
  });
});
