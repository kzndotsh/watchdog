import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchRdapWhoisEffect } from "../rdap";

describe("rdap whois", () => {
  it.effect("fetchRdapWhoisEffect maps registrar and nameservers", () =>
    Effect.gen(function* fetchRdapWhoisGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              ldhName: "EXAMPLE.COM",
              status: ["client transfer prohibited"],
              entities: [
                {
                  roles: ["registrar"],
                  vcardArray: [
                    "vcard",
                    [["fn", {}, "text", "Example Registrar"]],
                  ],
                },
              ],
              nameservers: [{ ldhName: "ns1.example.com" }],
              events: [
                {
                  eventAction: "registration",
                  eventDate: "2000-01-01T00:00:00Z",
                },
              ],
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchRdapWhoisEffect(
        "example.com",
        AbortSignal.timeout(5000)
      );

      expect(snap.source).toBe("rdap");
      expect(snap.registrar).toBe("Example Registrar");
      expect(snap.nameservers).toContain("ns1.example.com");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
