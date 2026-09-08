import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { ValidationVendorError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";

const { mockResolver } = vi.hoisted(() => ({
  mockResolver: {
    resolve4: vi.fn(),
    resolve6: vi.fn(),
    resolveMx: vi.fn(),
    resolveTxt: vi.fn(),
    resolveNs: vi.fn(),
  },
}));

vi.mock("../abortable-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../abortable-resolver")>();
  return {
    ...actual,
    runAbortableResolver: (
      _signal: AbortSignal,
      _message: string,
      body: (resolver: typeof mockResolver) => Effect.Effect<unknown>
    ) => body(mockResolver),
  };
});

import { resolveDnsRecordsEffect } from "../resolve";

describe("resolveDnsRecords", () => {
  it.effect("returns A/AAAA/MX/TXT/NS record sets", () =>
    Effect.gen(function* resolveDnsRecordsSuccessGen() {
      mockResolver.resolve4.mockResolvedValueOnce(["93.184.216.34"]);
      mockResolver.resolve6.mockResolvedValueOnce([]);
      mockResolver.resolveMx.mockResolvedValueOnce([
        { exchange: "mx.example.com", priority: 10 },
      ]);
      mockResolver.resolveTxt.mockResolvedValueOnce([["v=spf1 -all"]]);
      mockResolver.resolveNs.mockResolvedValueOnce(["ns.example.com"]);

      const records = yield* resolveDnsRecordsEffect(
        "example.com",
        AbortSignal.timeout(5000)
      );

      expect(records.host).toBe("example.com");
      expect(records.a).toContain("93.184.216.34");
      expect(records.mx[0]?.exchange).toBe("mx.example.com");
      expect(records.ns).toContain("ns.example.com");
    })
  );

  it.effect("dedupes equivalent IPv6 AAAA answers", () =>
    Effect.gen(function* resolveDnsRecordsIpv6DedupeGen() {
      mockResolver.resolve4.mockResolvedValueOnce([]);
      mockResolver.resolve6.mockResolvedValueOnce([
        "2001:0db8:0000:0000:0000:0000:0000:0001",
        "2001:db8::1",
      ]);
      mockResolver.resolveMx.mockResolvedValueOnce([]);
      mockResolver.resolveTxt.mockResolvedValueOnce([]);
      mockResolver.resolveNs.mockResolvedValueOnce([]);

      const records = yield* resolveDnsRecordsEffect(
        "example.com",
        AbortSignal.timeout(5000)
      );

      expect(records.aaaa).toEqual(["2001:db8::1"]);
    })
  );

  it.effect("resolveDnsRecordsEffect rejects IP literals", () =>
    Effect.gen(function* resolveDnsRecordsRejectIpGen() {
      const outcome = yield* Effect.result(
        resolveDnsRecordsEffect("8.8.8.8", AbortSignal.timeout(5000))
      );

      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("resolveDnsRecordsEffect rejects invalid hostnames", () =>
    Effect.gen(function* resolveDnsRecordsRejectHostGen() {
      const outcome = yield* Effect.result(
        resolveDnsRecordsEffect("not a host!", AbortSignal.timeout(5000))
      );

      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
