import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchIpctlLookupEffect,
  ipctlLookupSnapshotSchema,
  parseIpctlBody,
} from "../ipctl";

describe("ipctl", () => {
  it("parseIpctlBody maps nested BGP and GeoIP fields", () => {
    const snap = parseIpctlBody("8.8.8.8", "2026-01-01T00:00:00.000Z", {
      asn: { asn: 15_169, name: "GOOGLE", country_code: "US", rir: "ARIN" },
      prefix: {
        prefix: "8.8.8.0/24",
        country_code: "US",
        rir: "ARIN",
        rpki_status: "valid",
      },
      reverse_dns: "dns.google",
      is_anycast: true,
      is_bogon: false,
      geo: {
        country_code: "US",
        city: "Mountain View",
        region_name: "California",
        country_name: "United States",
      },
      threat_score: 0,
      tags: [{ name: "anycast" }],
    });

    expect(ipctlLookupSnapshotSchema.parse(snap).asn).toBe(15_169);
    expect(snap.reverseDns).toBe("dns.google");
    expect(snap.tags).toEqual(["anycast"]);
    expect(snap.geoCity).toBe("Mountain View");
  });

  it("parseIpctlBody tolerates flat tag arrays", () => {
    const snap = parseIpctlBody("1.2.3.4", "2026-01-01T00:00:00.000Z", {
      tags: ["cdn", "anycast"],
    });
    expect(snap.tags).toEqual(["cdn", "anycast"]);
  });

  it.effect("fetchIpctlLookupEffect maps API responses", () =>
    Effect.gen(function* fetchIpctlGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              data: {
                asn: { asn: 15_169, name: "GOOGLE" },
                reverse_dns: "dns.google",
              },
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchIpctlLookupEffect(
        "8.8.8.8",
        AbortSignal.timeout(5000)
      );

      expect(snap.asn).toBe(15_169);
      expect(snap.reverseDns).toBe("dns.google");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
