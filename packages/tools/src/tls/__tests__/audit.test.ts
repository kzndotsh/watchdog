import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";

import { ValidationVendorError } from "../../errors/tagged-errors";
import { fetchTlsAuditEffect, tlsAuditSnapshotSchema } from "../audit";

describe("tls audit schema", () => {
  it("parses TLS audit snapshots", () => {
    const snap = tlsAuditSnapshotSchema.parse({
      host: "example.com",
      port: 443,
      queriedAt: "2026-01-01T00:00:00.000Z",
      protocol: "TLSv1.3",
      authorized: true,
      authorizationError: null,
      cipher: { name: "TLS_AES_256_GCM_SHA384" },
      certificate: {
        subject: "example.com",
        issuer: "Example CA",
        validFrom: "2026-01-01",
        validTo: "2026-07-01",
        fingerprint256: "abc",
        subjectAltNames: ["DNS:example.com"],
        serialNumber: "1",
      },
    });
    expect(snap.authorized).toBe(true);
  });

  it.effect("rejects private and loopback hosts", () =>
    Effect.gen(function* rejectPrivateHostGen() {
      const outcome = yield* Effect.result(
        fetchTlsAuditEffect("127.0.0.1", new AbortController().signal)
      );

      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    })
  );
});
