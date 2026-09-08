import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  createClaimInputSchema,
  createEventInputSchema,
  createIdentifierInputSchema,
  createQuestionInputSchema,
  retractClaimInputSchema,
  updateClaimInputSchema,
  updateEventInputSchema,
  updateIdentifierInputSchema,
  updateQuestionInputSchema,
} from "../index";

const CASE_ID = testId(0);
const ENTITY_ID = testId(1);
const CLAIM_ID = testId(2);
const EVENT_ID = testId(3);
const QUESTION_ID = testId(4);
const IDENTIFIER_ID = testId(5);

describe("graph child scoped input schemas", () => {
  it("parses claim create and retract payloads", () => {
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

  it("rejects empty claim update input", () => {
    expect(
      updateClaimInputSchema.safeParse({ caseId: CASE_ID, claimId: CLAIM_ID })
        .success
    ).toBe(false);
  });

  it("parses event create and update payloads", () => {
    expect(
      createEventInputSchema.parse({
        caseId: CASE_ID,
        entityId: ENTITY_ID,
        when: "2024-01-01",
        what: "Met at cafe",
      })
    ).toMatchObject({
      caseId: CASE_ID,
      entityId: ENTITY_ID,
      when: "2024-01-01",
      what: "Met at cafe",
    });

    expect(
      updateEventInputSchema.safeParse({
        caseId: CASE_ID,
        eventId: EVENT_ID,
      }).success
    ).toBe(false);
  });

  it("parses question create and update payloads", () => {
    expect(
      createQuestionInputSchema.parse({
        caseId: CASE_ID,
        entityId: ENTITY_ID,
        text: "Who owns this domain?",
      }).text
    ).toBe("Who owns this domain?");

    expect(
      updateQuestionInputSchema.safeParse({
        caseId: CASE_ID,
        questionId: QUESTION_ID,
      }).success
    ).toBe(false);
  });

  it("validates identifier create and update payloads", () => {
    expect(
      createIdentifierInputSchema.parse({
        caseId: CASE_ID,
        entityId: ENTITY_ID,
        type: "email",
        value: "ops@example.com",
        confidence: "unverified",
      }).value
    ).toBe("ops@example.com");

    expect(
      updateIdentifierInputSchema.safeParse({
        caseId: CASE_ID,
        identifierId: IDENTIFIER_ID,
      }).success
    ).toBe(false);
  });
});
