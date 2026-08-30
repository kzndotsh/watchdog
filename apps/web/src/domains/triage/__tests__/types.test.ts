import { describe, expect, it } from "vitest";

import {
  acceptProposalInputSchema,
  listProposalsInputSchema,
  rejectProposalInputSchema,
} from "@/domains/triage/types";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440000";
const PROPOSAL_ID = "660e8400-e29b-41d4-a716-446655440001";

describe("triage input schemas", () => {
  it("parses proposal list and decision payloads", () => {
    expect(listProposalsInputSchema.parse({ caseId: CASE_ID }).caseId).toBe(
      CASE_ID
    );
    expect(
      acceptProposalInputSchema.parse({
        caseId: CASE_ID,
        proposalId: PROPOSAL_ID,
        confidence: "possible",
      }).confidence
    ).toBe("possible");
    expect(
      rejectProposalInputSchema.parse({
        caseId: CASE_ID,
        proposalId: PROPOSAL_ID,
        reason: "Duplicate",
      }).reason
    ).toBe("Duplicate");
  });
});
