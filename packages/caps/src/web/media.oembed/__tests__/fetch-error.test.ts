import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { ValidationVendorError } from "@watchdog/tools/errors";

const { fetchOembedEffect } = vi.hoisted(() => ({
  fetchOembedEffect: vi.fn(),
}));

vi.mock("@watchdog/tools/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/tools/http")>();
  return { ...actual, fetchOembedEffect };
});

import { createCapRunHarness, runCap } from "../../../testing";
import { mediaOembed } from "../cap.ts";

const UPSTREAM = "HTTP 403 from 10.1.2.3 (secret-gateway.internal)";

describe("web.media.oembed fetch failure", () => {
  it("keeps upstream error text out of the failure message", async () => {
    fetchOembedEffect.mockReturnValueOnce(
      Effect.succeed({
        url: "https://youtu.be/x",
        queriedAt: "2026-01-01T00:00:00.000Z",
        vendor: "youtube",
        error: UPSTREAM,
      })
    );
    const harness = createCapRunHarness({
      input: { url: "https://youtu.be/x" },
    });
    const failure: unknown = await runCap(
      mediaOembed.run({ ...harness.ctx })
    ).then(
      () => undefined,
      (error: unknown) => error
    );
    if (!(failure instanceof ValidationVendorError)) {
      expect.unreachable("expected ValidationVendorError");
    }
    expect(failure.message).not.toMatch(/10\.1\.2\.3|secret-gateway|403/);
    expect(failure).toMatchObject({
      cause: "upstream error (details withheld)",
    });
  });
});
