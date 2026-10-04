import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { FetchBytesResult } from "@watchdog/tools/http";
import { toolsHttpClientLayer } from "@watchdog/tools/http";

const { fetchBytesToolEffect } = vi.hoisted(() => ({
  fetchBytesToolEffect: vi.fn(),
}));

vi.mock("@watchdog/tools/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/tools/http")>();
  return {
    ...actual,
    fetchBytesEffect: fetchBytesToolEffect,
  };
});

import { fetchBytesEffect } from "../fetch-bytes";

describe("url.enrich fetchBytesEffect", () => {
  it("delegates to tools.fetchBytesEffect with enrich defaults", async () => {
    const body: FetchBytesResult = {
      ok: true,
      status: 200,
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/octet-stream",
      finalUrl: "https://example.com",
    };
    fetchBytesToolEffect.mockReturnValueOnce(Effect.succeed(body));

    const result = await Effect.runPromise(
      fetchBytesEffect("https://example.com", AbortSignal.timeout(5000)).pipe(
        Effect.provide(toolsHttpClientLayer)
      )
    );

    expect(result).toEqual(body);
    expect(fetchBytesToolEffect).toHaveBeenCalledWith(
      "https://example.com",
      expect.any(AbortSignal),
      expect.objectContaining({ maxBytes: expect.any(Number) })
    );
  });
});
