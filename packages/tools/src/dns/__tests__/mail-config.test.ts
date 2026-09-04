import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

const { mockResolver } = vi.hoisted(() => ({
  mockResolver: {
    resolveMx: vi.fn(),
    resolveTxt: vi.fn(),
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

import { fetchMailConfigEffect } from "../mail-config";

describe("fetchMailConfig", () => {
  it.effect("collects MX and SPF records from DNS", () =>
    Effect.gen(function* fetchMailConfigSuccessGen() {
      mockResolver.resolveMx.mockResolvedValueOnce([
        { exchange: "mx.example.com", priority: 10 },
      ]);
      mockResolver.resolveTxt.mockImplementation(async (name: string) => {
        if (name === "example.com") return [["v=spf1 -all"]];
        if (name === "_dmarc.example.com") return [];
        return [];
      });

      const snap = yield* fetchMailConfigEffect(
        "example.com",
        AbortSignal.timeout(5000),
        {
          dkimSelectors: ["default"],
        }
      );

      expect(snap.host).toBe("example.com");
      expect(snap.spf.present).toBe(true);
      expect(snap.mx[0]?.exchange).toBe("mx.example.com");
    })
  );
});
