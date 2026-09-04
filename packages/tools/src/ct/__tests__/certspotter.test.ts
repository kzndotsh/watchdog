import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "@effect/vitest";
import { Effect } from "effect";

import { HttpResponse, mockServer, http } from "@watchdog/test-kit/http";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  certspotterLookupSnapshotSchema,
  fetchCertspotterLookupEffect,
} from "../certspotter";

describe("certspotter", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    mockServer.resetHandlers();
  });

  afterAll(() => {
    mockServer.close();
  });

  it("parses lookup snapshot schema", () => {
    const snap = certspotterLookupSnapshotSchema.parse({
      host: "example.com",
      queriedAt: "2026-01-01T00:00:00.000Z",
      source: "api.certspotter.com/v1/issuances",
      domains: ["example.com"],
      issuances: [
        {
          id: "1",
          dnsNames: ["example.com"],
          notBefore: null,
          notAfter: null,
          revoked: null,
          certSha256: null,
        },
      ],
    });
    expect(snap.domains).toContain("example.com");
  });

  it.effect("fetchCertspotterLookupEffect maps issuance rows", () =>
    Effect.gen(function* fetchCertspotterLookupGen() {
      mockServer.use(
        http.get("https://api.certspotter.com/v1/issuances", () =>
          HttpResponse.json([
            {
              id: 42,
              dns_names: ["*.example.com", "api.example.com"],
              not_before: "2026-01-01T00:00:00Z",
              not_after: "2026-07-01T00:00:00Z",
              revoked: false,
              cert_sha256: "abc",
            },
          ])
        )
      );

      const snap = yield* fetchCertspotterLookupEffect(
        "example.com",
        AbortSignal.timeout(5000)
      );

      expect(snap.host).toBe("example.com");
      expect(snap.issuances[0]?.id).toBe("42");
      expect(snap.domains).toContain("example.com");
      expect(snap.domains).toContain("api.example.com");
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
