import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchC99SubdomainsEffect } from "../c99";

describe("c99", () => {
  it.effect("fetchC99SubdomainsEffect maps subdomain rows", () =>
    Effect.gen(function* fetchC99Gen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              subdomains: [
                { subdomain: "www.example.com", ip: "1.2.3.4" },
                { domain: "*.cdn.example.com" },
              ],
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchC99SubdomainsEffect(
        "example.com",
        "test-key",
        AbortSignal.timeout(5000),
        { userAgent: "watchdog-test" }
      );

      expect(snap.domains).toEqual(["www.example.com", "cdn.example.com"]);
      expect(snap.hits[0]?.ip).toBe("1.2.3.4");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
