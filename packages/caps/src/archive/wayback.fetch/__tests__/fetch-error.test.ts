import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { ValidationVendorError } from "@watchdog/tools/errors";

const { closestWaybackTimestampEffect, fetchWaybackSnapshotEffect } =
  vi.hoisted(() => ({
    closestWaybackTimestampEffect: vi.fn(),
    fetchWaybackSnapshotEffect: vi.fn(),
  }));

vi.mock("@watchdog/tools/wayback", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@watchdog/tools/wayback")>();
  return {
    ...actual,
    closestWaybackTimestampEffect,
    fetchWaybackSnapshotEffect,
  };
});

import { createCapRunHarness, runCap } from "../../../testing";
import { waybackFetch } from "../cap.ts";

const URL_WITH_SECRET = "https://example.com/page?token=SECRET123";

async function failureOf(input: { url: string; timestamp?: string }) {
  const harness = createCapRunHarness({ input });
  const failure: unknown = await runCap(
    waybackFetch.run({ ...harness.ctx })
  ).then(
    () => undefined,
    (error: unknown) => error
  );
  if (!(failure instanceof ValidationVendorError)) {
    expect.unreachable("expected ValidationVendorError");
  }
  return failure;
}

describe("archive.wayback.fetch failures", () => {
  it("keeps the caller URL out of the no-snapshot message", async () => {
    closestWaybackTimestampEffect.mockReturnValueOnce(Effect.succeed(null));
    const failure = await failureOf({ url: URL_WITH_SECRET });
    expect(failure.message).toBe("No Wayback snapshot found");
    expect(String(failure.cause)).toContain("no CDX snapshot");
    expect(String(failure.cause)).not.toMatch(/SECRET123|example\.com/);
  });

  it("keeps upstream fetch errors out of the message", async () => {
    fetchWaybackSnapshotEffect.mockReturnValueOnce(
      Effect.succeed({
        ok: false,
        status: 502,
        error: `bad gateway for ${URL_WITH_SECRET} via 10.0.0.9`,
      })
    );
    const failure = await failureOf({
      url: URL_WITH_SECRET,
      timestamp: "20200101000000",
    });
    expect(failure.message).toBe("Wayback fetch failed");
    // Free upstream text is withheld (it can echo the URL); status is kept.
    expect(failure.cause).toBe("HTTP 502");
    expect(String(failure.cause)).not.toMatch(/SECRET123|10\.0\.0\.9/);
  });
});
