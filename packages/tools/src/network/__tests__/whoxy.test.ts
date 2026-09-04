import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchWhoxyWhoisEffect, whoxyLookupSnapshotSchema } from "../whoxy";

describe("whoxy", () => {
  it.effect("fetchWhoxyWhoisEffect maps WHOIS payloads", () =>
    Effect.gen(function* fetchWhoxyWhoisGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              status: 1,
              domain_name: "example.com",
              create_date: "2000-01-01",
              domain_registrar: { registrar_name: "Example Registrar" },
              name_servers: ["ns1.example.com"],
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchWhoxyWhoisEffect(
        "example.com",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(whoxyLookupSnapshotSchema.parse(snap).ok).toBe(true);
      expect(snap.registrarName).toBe("Example Registrar");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
