import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchXforceLookupEffect, xforceLookupSnapshotSchema } from "../xforce";

describe("xforce", () => {
  it.effect("fetchXforceLookupEffect maps IP reputation reports", () =>
    Effect.gen(function* fetchXforceLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
          let href: string;
          if (typeof input === "string") {
            href = input;
          } else if (input instanceof URL) {
            href = input.href;
          } else {
            href = input.url;
          }
          if (href.includes("/ipr/malware/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ malware: [{ family: "Emotet" }] }),
                {
                  status: 200,
                }
              )
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({
                score: 1,
                cats: { AnonymisationServices: 50 },
              }),
              { status: 200 }
            )
          );
        })
      );

      const snap = yield* fetchXforceLookupEffect(
        "8.8.8.8",
        "key",
        "pass",
        AbortSignal.timeout(5000)
      );

      expect(xforceLookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.score).toBe(1);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
