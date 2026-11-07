import { describe, expect, it } from "vitest";

import {
  GC_DEFAULT,
  GC_REALTIME,
  GC_STABLE,
  STALE_DEFAULT,
  STALE_REALTIME,
  STALE_STABLE,
} from "@/shared/lib/query-stale";

describe("query-stale tiers", () => {
  it("keeps gcTime at or above staleTime for each tier", () => {
    expect(GC_REALTIME).toBeGreaterThanOrEqual(STALE_REALTIME);
    expect(GC_DEFAULT).toBeGreaterThanOrEqual(STALE_DEFAULT);
    expect(GC_STABLE).toBeGreaterThanOrEqual(STALE_STABLE);
  });
});
