import { describe, expect, it } from "vitest";

import {
  evidenceShowsInlineText,
  isTextEvidenceMime,
  tryParseEvidenceJson,
} from "@/domains/intake/lib/evidence";
import type { EvidenceRecord } from "@/domains/intake/types";
import { testId } from "@watchdog/test-kit";

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: testId(40),
    caseId: testId(10),
    entityId: null,
    kind: "file",
    label: "Artifact",
    notes: null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: '{"ok":true}',
    sourceUrl: null,
    actorId: "actor-1",
    actorLabel: "actor-1",
    capturedAt: "2026-01-01T00:00:00.000Z",
    processedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("isTextEvidenceMime", () => {
  it("matches common text and structured text mimes", () => {
    expect(isTextEvidenceMime("text/plain")).toBe(true);
    expect(isTextEvidenceMime("application/json")).toBe(true);
    expect(isTextEvidenceMime("application/ld+json")).toBe(true);
    expect(isTextEvidenceMime("application/xml")).toBe(true);
    expect(isTextEvidenceMime("text/yaml")).toBe(true);
  });

  it("rejects binary and empty mimes", () => {
    expect(isTextEvidenceMime("image/png")).toBe(false);
    expect(isTextEvidenceMime(null)).toBe(false);
    expect(isTextEvidenceMime("")).toBe(false);
  });
});

describe("tryParseEvidenceJson", () => {
  it("parses valid JSON text", () => {
    expect(tryParseEvidenceJson('{"ok":true}')).toEqual({
      ok: true,
      data: { ok: true },
    });
  });

  it("returns ok:false for invalid JSON", () => {
    expect(tryParseEvidenceJson("{not json")).toEqual({ ok: false });
  });
});

describe("evidenceShowsInlineText", () => {
  it("treats attestations as text even without a text mime", () => {
    expect(
      evidenceShowsInlineText(
        evidence({ kind: "attestation", mime: "application/octet-stream" })
      )
    ).toBe(true);
  });

  it("treats JSON file evidence as text-shaped", () => {
    expect(
      evidenceShowsInlineText(
        evidence({ kind: "file", mime: "application/json" })
      )
    ).toBe(true);
  });
});
