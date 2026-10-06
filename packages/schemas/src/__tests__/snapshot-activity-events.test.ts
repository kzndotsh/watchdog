import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { activityItemSchema } from "../activity.ts";
import { evidenceSnapshotSchema } from "../evidence-snapshot.ts";

describe("evidenceSnapshotSchema", () => {
  it("accepts a packed snapshot and rejects a missing text field", () => {
    const packed = evidenceSnapshotSchema.safeParse({
      evidenceId: testId(40),
      caseId: testId(10),
      kind: "url_archive",
      text: "body",
      packedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(packed.success).toBe(true);

    const missingText = evidenceSnapshotSchema.safeParse({
      evidenceId: testId(40),
      caseId: testId(10),
      kind: "url_archive",
      packedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(missingText.success).toBe(false);
  });
});

describe("activityItemSchema", () => {
  it("rejects an unknown kind", () => {
    const parsed = activityItemSchema.safeParse({
      id: testId(50),
      kind: "console",
      action: "created",
      caseId: testId(10),
      caseName: "Ada",
      label: "x",
      at: "2026-01-01T00:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });
});
