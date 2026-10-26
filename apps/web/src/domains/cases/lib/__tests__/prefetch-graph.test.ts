import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureGraphQueries,
  warmGraphQueries,
} from "@/domains/cases/lib/prefetch-graph";
import { graphSnapshotQuery } from "@/domains/entities/edges/queries";

// Warm helpers fetch in the browser only; this node project stands in for it.
beforeEach(() => {
  vi.stubGlobal("window", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function queriedKeys(query: ReturnType<typeof vi.fn>): unknown[] {
  return query.mock.calls.map(([options]: unknown[]) =>
    typeof options === "object" && options !== null
      ? Reflect.get(options, "queryKey")
      : undefined
  );
}

describe("ensureGraphQueries", () => {
  it("loads the Case's graph snapshot, and nothing else", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);

    await ensureGraphQueries(client, "case-1");

    expect(queriedKeys(query)).toEqual([graphSnapshotQuery("case-1").queryKey]);
  });
});

describe("warmGraphQueries", () => {
  it("warms the snapshot without blocking", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);

    warmGraphQueries(client, "case-1");
    await Promise.resolve();

    expect(queriedKeys(query)).toEqual([graphSnapshotQuery("case-1").queryKey]);
  });
});
