import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";

const { mockResolver } = vi.hoisted(() => ({
  mockResolver: {
    cancel: vi.fn(),
    resolveTxt: vi.fn(),
  },
}));

vi.mock("node:dns/promises", () => ({
  Resolver: function Resolver() {
    return mockResolver;
  },
}));

import { fetchIpLookupEffect, ipLookupSnapshotSchema } from "../ip-lookup";

describe("ip-lookup", () => {
  it.effect("fetchIpLookupEffect parses Team Cymru origin TXT", () =>
    Effect.gen(function* fetchIpLookupGen() {
      mockResolver.resolveTxt.mockImplementation(async (name: string) => {
        // Exact Team Cymru origin name for 8.8.8.8 (avoid substring host checks).
        if (name === "8.8.8.8.origin.asn.cymru.com") {
          return [["15169 | 8.8.8.0/24 | US | arin | 2000-03-30"]];
        }
        // The tools host normalizer lowercases every name before it is sent.
        if (name === "as15169.asn.cymru.com") {
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
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
