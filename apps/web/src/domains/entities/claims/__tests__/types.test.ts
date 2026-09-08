import { describe, expect, it } from "vitest";

import {
  createClaimInputSchema,
  listClaimsInputSchema,
  retractClaimInputSchema,
  updateClaimInputSchema,
} from "@/domains/entities/claims/types";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440000";
const ENTITY_ID = "660e8400-e29b-41d4-a716-446655440001";
const CLAIM_ID = "770e8400-e29b-41d4-a716-446655440002";

describe("claim input schemas", () => {
  it("defaults includeRetracted to false for list input", () => {
    expect(
      listClaimsInputSchema.parse({ caseId: CASE_ID, entityId: ENTITY_ID })
        .includeRetracted
    ).toBe(false);
  });

  it("parses create and retract claim payloads", () => {
    expect(
      createClaimInputSchema.parse({
        caseId: CASE_ID,
        entityId: ENTITY_ID,
        text: "Observed alias",
        confidence: "unverified",
      }).class
    ).toBe("observation");

    expect(
      retractClaimInputSchema.parse({
        caseId: CASE_ID,
        claimId: CLAIM_ID,
        kind: "retracted",
        reason: "Wrong target",
      }).kind
    ).toBe("retracted");
  });

  it("trims padded UUIDs on list input", () => {
    expect(
      listClaimsInputSchema.parse({
        caseId: `  ${CASE_ID}  `,
        entityId: `  ${ENTITY_ID}  `,
      })
    ).toEqual({
      caseId: CASE_ID,
      entityId: ENTITY_ID,
      includeRetracted: false,
    });
  });

  it("rejects empty claim update input", () => {
    expect(
      updateClaimInputSchema.safeParse({ caseId: CASE_ID, claimId: CLAIM_ID })
        .success
    ).toBe(false);
  });
});
