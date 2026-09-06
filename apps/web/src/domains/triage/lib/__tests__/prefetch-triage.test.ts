import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

import { evidenceListQuery } from "@/domains/intake/queries";
import { warmTriageQueries } from "@/domains/triage/lib/prefetch-triage";
import { allProposalsQuery } from "@/domains/triage/queries";

describe("warmTriageQueries", () => {
  it("revalidates proposals and prefetches evidence", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);

    warmTriageQueries(client, "case-1");
    await Promise.resolve();

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: allProposalsQuery("case-1").queryKey,
      })
    );
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: evidenceListQuery("case-1").queryKey,
      })
    );
  });
});
