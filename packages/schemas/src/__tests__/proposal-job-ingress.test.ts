import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { retractClaimFieldsSchema } from "../claim-retract";
import { graphWriteInputSchema } from "../graph-write";
import { startJobInputSchema } from "../job-ingress";
import {
  acceptProposalInputSchema,
  createProposalInputSchema,
  listProposalsInputSchema,
  rejectProposalInputSchema,
} from "../proposal-ingress";

const CASE_ID = testId(0);
const PROPOSAL_ID = testId(1);
const EVIDENCE_ID = testId(2);

describe("proposal ingress schemas", () => {
  it("normalizes list status and accept fields", () => {
    expect(
      listProposalsInputSchema.parse({
        caseId: CASE_ID,
        status: "  pending  ",
      }).status
    ).toBe("pending");
    expect(
      acceptProposalInputSchema.parse({
        caseId: CASE_ID,
        proposalId: PROPOSAL_ID,
        sharedEvidenceIds: [`  ${EVIDENCE_ID}  `],
        attestationText: "  reviewed  ",
      })
    ).toEqual({
      caseId: CASE_ID,
      proposalId: PROPOSAL_ID,
      sharedEvidenceIds: [EVIDENCE_ID],
      attestationText: "reviewed",
    });
  });

  it("trims reject reason", () => {
    expect(
      rejectProposalInputSchema.parse({
        caseId: CASE_ID,
        proposalId: PROPOSAL_ID,
        reason: "  duplicate  ",
      }).reason
    ).toBe("duplicate");
  });
});

describe("createProposalInputSchema", () => {
  it("requires a non-empty patch", () => {
    expect(
      createProposalInputSchema.safeParse({
        caseId: CASE_ID,
        patch: [],
      }).success
    ).toBe(false);
  });
});

describe("graphWriteInputSchema", () => {
  it("requires userOverride true", () => {
    expect(
      graphWriteInputSchema.safeParse({
        caseId: CASE_ID,
        patch: [{ op: "create", type: "entity", data: { name: "Test" } }],
        userOverride: false,
      }).success
    ).toBe(false);
  });
});

describe("startJobInputSchema", () => {
  it("trims capability id and normalizes input ids", () => {
    const entityId = testId(3);
    expect(
      startJobInputSchema.parse({
        caseId: CASE_ID,
        capabilityId: "  network.dns.lookup  ",
        input: {
          entityId: `  ${entityId}  `,
          host: "example.com",
        },
      })
    ).toEqual({
      caseId: CASE_ID,
      capabilityId: "network.dns.lookup",
      input: { entityId, host: "example.com" },
    });
  });

  it("rejects invalid graph id fields in job input", () => {
    expect(
      startJobInputSchema.safeParse({
        caseId: CASE_ID,
        capabilityId: "network.dns.lookup",
        input: { entityId: "ent-1", host: "example.com" },
      }).success
    ).toBe(false);
  });
});

describe("retractClaimFieldsSchema", () => {
  it("trims reason text", () => {
    expect(
      retractClaimFieldsSchema.parse({
        kind: "retracted",
        reason: "  mistaken identity  ",
      })
    ).toEqual({
      kind: "retracted",
      reason: "mistaken identity",
    });
  });
});
