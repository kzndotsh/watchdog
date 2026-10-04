import { describe, expect, it } from "vitest";

import type { EvidenceSnapshot } from "@watchdog/schemas/evidence";

import {
  MAX_SNAPSHOT_CHARS,
  snapshotToArtifactBytes,
} from "../pack-evidence-snapshot.ts";

describe("snapshotToArtifactBytes", () => {
  it("serializes a snapshot under the char cap", () => {
    const snapshot: EvidenceSnapshot = {
      evidenceId: "11111111-1111-4111-8111-000000000001",
      caseId: "11111111-1111-4111-8111-000000000002",
      kind: "attestation",
      text: "hello",
      sha256: null,
      uri: null,
      packedAt: "2026-01-01T00:00:00.000Z",
      packerVersion: 1,
    };
    const bytes = snapshotToArtifactBytes(snapshot);
    const json = new TextDecoder().decode(bytes);
    expect(json).toContain("hello");
    expect(json.length).toBeLessThan(MAX_SNAPSHOT_CHARS);
  });
});
