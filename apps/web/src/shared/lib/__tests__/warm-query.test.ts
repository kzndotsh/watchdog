import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  warmEnsureQueryData,
  warmPrefetchQuery,
} from "@/shared/lib/warm-query";

describe("warm-query", () => {
  it("swallows CancelledError from ensureAppQueryData", async () => {
    const client = {
      query: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("CancelledError"), { name: "CancelledError" })
        ),
    } as unknown as QueryClient;

    warmEnsureQueryData(client, { queryKey: ["test"] });
    await Promise.resolve();
    expect(client.query).toHaveBeenCalledOnce();
  });

  it("swallows CancelledError from warmPrefetchQuery", async () => {
    const client = {
      query: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("CancelledError"), { name: "CancelledError" })
        ),
    } as unknown as QueryClient;

    warmPrefetchQuery(client, { queryKey: ["test"] });
    await Promise.resolve();
    expect(client.query).toHaveBeenCalledOnce();
  });

  it("logs non-cancellation errors from warmEnsureQueryData", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      query: vi.fn().mockRejectedValue(new Error("network down")),
    } as unknown as QueryClient;

    warmEnsureQueryData(client, { queryKey: ["test"] });
    await vi.waitUntil(() => errorSpy.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledWith("[warm-query]", expect.any(Error));
    errorSpy.mockRestore();
  });
});
