import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  warmEnsureQueryData,
  warmPrefetchQuery,
} from "@/shared/lib/warm-query";

describe("warm-query", () => {
  // This project runs in node: a `window` marks the browser runtime.
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fetch on the server, so SSR and the first client render agree", () => {
    const client = { query: vi.fn() } as unknown as QueryClient;
    vi.stubGlobal("window", undefined);

    warmEnsureQueryData(client, { queryKey: ["test"] });
    warmEnsureQueryData(client, {
      queryKey: ["test"],
      revalidateIfStale: true,
    });
    warmPrefetchQuery(client, { queryKey: ["test"] });

    expect(client.query).not.toHaveBeenCalled();
  });

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
