import { describe, expect, it, vi } from "vitest";

import { GC_STABLE, STALE_STABLE } from "@/shared/lib/query-stale";

vi.mock("@/domains/settings/settings.functions", () => ({
  listCredentialsFn: vi.fn(),
}));

import {
  credentialsKeys,
  credentialsListQuery,
} from "@/domains/settings/queries";

describe("settings queries", () => {
  it("builds stable credentials keys", () => {
    expect(credentialsKeys.all).toEqual(["credentials"]);
  });

  it("uses stable stale and gc tiers for credentials list", () => {
    const query = credentialsListQuery();
    expect(query).toMatchObject({
      queryKey: credentialsKeys.all,
      staleTime: STALE_STABLE,
      gcTime: GC_STABLE,
    });
    expect(query.placeholderData).toBeTypeOf("function");
  });
});
