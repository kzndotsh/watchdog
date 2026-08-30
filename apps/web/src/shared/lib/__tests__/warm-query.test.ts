import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  warmEnsureQueryData,
  warmPrefetchQuery,
} from "@/shared/lib/warm-query";

describe("warm-query", () => {
  it("swallows CancelledError from ensureQueryData", async () => {
    const client = {
      ensureQueryData: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("CancelledError"), { name: "CancelledError" })
        ),
    } as unknown as QueryClient;

    warmEnsureQueryData(client, { queryKey: ["test"] });
    await Promise.resolve();
    expect(client.ensureQueryData).toHaveBeenCalledOnce();
  });

  it("swallows CancelledError from prefetchQuery", async () => {
    const client = {
      prefetchQuery: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("CancelledError"), { name: "CancelledError" })
        ),
    } as unknown as QueryClient;

    warmPrefetchQuery(client, { queryKey: ["test"] });
    await Promise.resolve();
    expect(client.prefetchQuery).toHaveBeenCalledOnce();
  });
});
