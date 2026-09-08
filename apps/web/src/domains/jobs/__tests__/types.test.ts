import { describe, expect, it } from "vitest";

import {
  getArtifactContentInputSchema,
  startJobInputSchema,
} from "@/domains/jobs/types";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440000";
const JOB_ID = "660e8400-e29b-41d4-a716-446655440001";
const EVIDENCE_ID = "770e8400-e29b-41d4-a716-446655440002";

describe("jobs input schemas", () => {
  it("trims and lowercases padded sha256 on job artifact input", () => {
    const sha256 = "a".repeat(64);
    const parsed = getArtifactContentInputSchema.parse({
      source: "job",
      caseId: CASE_ID,
      jobId: JOB_ID,
      sha256: `  ${sha256.toUpperCase()}  `,
      mime: "text/plain",
    });
    expect(parsed.source).toBe("job");
    if (parsed.source !== "job") throw new Error("expected job source");
    expect(parsed.sha256).toBe(sha256);
  });

  it("rejects invalid sha256 on job artifact input", () => {
    expect(
      getArtifactContentInputSchema.safeParse({
        source: "job",
        caseId: CASE_ID,
        jobId: JOB_ID,
        sha256: "deadbeef",
        mime: "text/plain",
      }).success
    ).toBe(false);
  });

  it("trims padded evidenceId on evidence artifact input", () => {
    const parsed = getArtifactContentInputSchema.parse({
      source: "evidence",
      caseId: CASE_ID,
      evidenceId: `  ${EVIDENCE_ID}  `,
      mime: "text/plain",
    });
    expect(parsed.source).toBe("evidence");
    if (parsed.source !== "evidence")
      throw new Error("expected evidence source");
    expect(parsed.evidenceId).toBe(EVIDENCE_ID);
  });

  it("trims padded graph ids on start job input", () => {
    const entityId = "880e8400-e29b-41d4-a716-446655440003";
    const parsed = startJobInputSchema.parse({
      caseId: CASE_ID,
      capabilityId: "network.dns.lookup",
      input: {
        entityId: `  ${entityId}  `,
        host: "example.com",
      },
    });
    expect(parsed.input).toEqual({ entityId, host: "example.com" });
  });
});
