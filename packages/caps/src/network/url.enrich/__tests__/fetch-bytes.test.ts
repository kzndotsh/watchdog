import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { FetchBytesResult } from "@watchdog/tools";

const { fetchBytesToolEffect } = vi.hoisted(() => ({
  fetchBytesToolEffect: vi.fn(),
}));

vi.mock("@watchdog/tools", () => ({
  fetchBytesEffect: fetchBytesToolEffect,
}));

import { fetchBytesEffect } from "../fetch-bytes";

describe("url.enrich fetchBytesEffect", () => {
  it("delegates to tools.fetchBytesEffect with enrich defaults", async () => {
    const body = new Uint8Array([1, 2, 3]);
    fetchBytesToolEffect.mockReturnValueOnce(Effect.succeed(body));

    const bytes = await Effect.runPromise(
      fetchBytesEffect(
        "https://example.com",
        AbortSignal.timeout(5000)
      ) as Effect.Effect<FetchBytesResult>
    );

    expect(bytes).toEqual(body);
    expect(fetchBytesToolEffect).toHaveBeenCalledWith(
      "https://example.com",
      expect.any(AbortSignal),
      expect.objectContaining({ maxBytes: expect.any(Number) })
    );
  });
});
