import { describe, expect, it } from "vitest";

import {
  attachEvidenceEntityInputSchema,
  dumpPasteInputSchema,
  dumpUrlInputSchema,
  evidenceScopeInputSchema,
  listEvidenceInputSchema,
  presignUploadInputSchema,
} from "@/domains/intake/types";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440000";
const EVIDENCE_ID = "660e8400-e29b-41d4-a716-446655440001";
const ENTITY_ID = "770e8400-e29b-41d4-a716-446655440002";

describe("intake input schemas", () => {
  it("trims padded UUIDs on evidence scope input", () => {
    expect(
      evidenceScopeInputSchema.parse({
        caseId: `  ${CASE_ID}  `,
        evidenceId: `  ${EVIDENCE_ID}  `,
      })
    ).toEqual({ caseId: CASE_ID, evidenceId: EVIDENCE_ID });
  });

  it("trims optional entityId on dump paste input", () => {
    expect(
      dumpPasteInputSchema.parse({
        caseId: CASE_ID,
        body: "paste body",
        entityId: `  ${ENTITY_ID}  `,
      }).entityId
    ).toBe(ENTITY_ID);
  });

  it("trims paste body text", () => {
    expect(
      dumpPasteInputSchema.parse({
        caseId: CASE_ID,
        body: "  paste body  ",
      }).body
    ).toBe("paste body");
  });

  it("rejects whitespace-only paste body", () => {
    expect(
      dumpPasteInputSchema.safeParse({
        caseId: CASE_ID,
        body: "   ",
      }).success
    ).toBe(false);
  });

  it("trims padded sha256 on presign upload input", () => {
    const sha256 = "a".repeat(64);
    expect(
      presignUploadInputSchema.parse({
        caseId: CASE_ID,
        sha256: `  ${sha256.toUpperCase()}  `,
        mime: "text/plain",
        byteLength: 1,
      }).sha256
    ).toBe(sha256);
  });

  it("defaults blank mime on presign upload input", () => {
    const sha256 = "a".repeat(64);
    expect(
      presignUploadInputSchema.parse({
        caseId: CASE_ID,
        sha256,
        mime: "   ",
        byteLength: 1,
      }).mime
    ).toBe("application/octet-stream");
  });

  it("trims padded sourceUrl on dump url input", () => {
    expect(
      dumpUrlInputSchema.parse({
        caseId: CASE_ID,
        sourceUrl: "  https://example.com/page  ",
      }).sourceUrl
    ).toBe("https://example.com/page");
  });

  it("trims padded entityId on attach evidence input", () => {
    expect(
      attachEvidenceEntityInputSchema.parse({
        caseId: CASE_ID,
        evidenceId: EVIDENCE_ID,
        entityId: `  ${ENTITY_ID}  `,
      }).entityId
    ).toBe(ENTITY_ID);
  });

  it("clears entity attachment when entityId is whitespace-only", () => {
    expect(
      attachEvidenceEntityInputSchema.parse({
        caseId: CASE_ID,
        evidenceId: EVIDENCE_ID,
        entityId: "   ",
      }).entityId
    ).toBeNull();
  });

  it("rejects hiddenOnly combined with active-queue filters", () => {
    expect(
      listEvidenceInputSchema.safeParse({
        caseId: CASE_ID,
        hiddenOnly: true,
        unprocessedOnly: true,
      }).success
    ).toBe(false);
  });
});
