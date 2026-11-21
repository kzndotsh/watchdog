import { afterEach, describe, expect, it, vi } from "vitest";

import { createTtlCache } from "../ttl-memory.ts";

describe("createTtlCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("expires a key after ttlMs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const cache = createTtlCache<string>(1000);
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    expect(cache.get("k")).toBeUndefined();
  });
});
