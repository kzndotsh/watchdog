import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import { claimText, itRejectsIncompleteReport } from "../../../testing";
import { tlsAudit } from "../cap.ts";
import { interpretTlsAuditReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    host: "example.com",
    port: 443,
    queriedAt: "2026-01-01T00:00:00.000Z",
    protocol: "TLSv1.3",
    authorized: true,
    authorizationError: null,
    cipher: { name: "TLS_AES_128_GCM_SHA256" },
    certificate: {
      subject: "example.com",
      issuer: "Example CA",
      validFrom: "2025-01-01T00:00:00.000Z",
      validTo: "2026-12-31T00:00:00.000Z",
      fingerprint256: "aa",
      subjectAltNames: ["DNS:example.com"],
      serialNumber: "1",
    },
  };

  it("interpretTlsAuditReport proposes Claim", () => {
    const result = interpretTlsAuditReport(fixture, {
      input: { host: "example.com", entityId },
    });
    expect(result.patch.length).toBe(1);
    expect(claimText(result, 0)).toMatch(/TLSv1\.3/);
    expect(claimText(result, 0)).toMatch(/authorized=true/);
  });

  itRejectsIncompleteReport(
    tlsAudit,
    { host: "example.com" },
    { host: "example.com" }
  );
});
