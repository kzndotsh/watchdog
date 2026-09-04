import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  abuseIpdbLookupSnapshotSchema,
  fetchAbuseIpdbCheckEffect,
} from "../abuseipdb";

describe("abuseipdb", () => {
  it.effect("fetchAbuseIpdbCheckEffect maps check responses", () =>
    Effect.gen(function* fetchAbuseIpdbCheckGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              data: {
                ipAddress: "8.8.8.8",
                abuseConfidenceScore: 0,
                totalReports: 0,
                numDistinctUsers: 0,
                lastReportedAt: null,
                isPublic: true,
                isWhitelisted: true,
                isp: "Google",
                domain: "google.com",
                usageType: "Content Delivery Network",
                countryCode: "US",
              },
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchAbuseIpdbCheckEffect(
        "8.8.8.8",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(abuseIpdbLookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.isWhitelisted).toBe(true);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
