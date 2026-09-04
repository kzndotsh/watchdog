import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

const { mockResolver } = vi.hoisted(() => ({
  mockResolver: {
    resolveTxt: vi.fn(),
  },
}));

vi.mock("../../dns/abortable-resolver", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../dns/abortable-resolver")>();
  return {
    ...actual,
    runAbortableResolver: (
      _signal: AbortSignal,
      _message: string,
      body: (resolver: typeof mockResolver) => Effect.Effect<unknown>
    ) => body(mockResolver),
  };
});

import { fetchIpLookupEffect, ipLookupSnapshotSchema } from "../ip-lookup";

describe("ip-lookup", () => {
  it.effect("fetchIpLookupEffect parses Team Cymru origin TXT", () =>
    Effect.gen(function* fetchIpLookupGen() {
      mockResolver.resolveTxt.mockImplementation(async (name: string) => {
        // Exact Team Cymru origin name for 8.8.8.8 (avoid substring host checks).
        if (name === "8.8.8.8.origin.asn.cymru.com") {
          return [["15169 | 8.8.8.0/24 | US | arin | 2000-03-30"]];
        }
        if (name === "AS15169.asn.cymru.com") {
          return [["15169 | US | arin | 2000-03-30 | GOOGLE - Google LLC"]];
        }
        return [];
      });

      const snap = yield* fetchIpLookupEffect(
        "8.8.8.8",
        AbortSignal.timeout(5000)
      );

      expect(ipLookupSnapshotSchema.parse(snap).asn).toBe("15169");
      expect(snap.asName).toContain("GOOGLE");
    })
  );
});
