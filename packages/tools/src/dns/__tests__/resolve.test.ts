import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

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
});
