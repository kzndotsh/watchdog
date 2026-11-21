import { describe, expect, it } from "vitest";

import {
  optionalClaimClassSchema,
  optionalConfidenceTierSchema,
  optionalEdgePredicateSchema,
  optionalEntityKindSchema,
  optionalIdentifierStatusSchema,
  optionalIdentifierTypeSchema,
  optionalProposalStatusSchema,
  optionalTaskPrioritySchema,
  optionalTaskStatusSchema,
  trimmedProposalStatusSchema,
  trimmedClaimClassSchema,
  trimmedConfidenceTierSchema,
  trimmedEdgePredicateSchema,
  trimmedEntityKindSchema,
  trimmedIdentifierStatusSchema,
  trimmedIdentifierTypeSchema,
  trimmedRetractKindSchema,
  trimmedTaskStatusSchema,
} from "../enums.ts";

describe("optionalProposalStatusSchema", () => {
  it("trims padded proposal status", () => {
    expect(optionalProposalStatusSchema.parse("  pending  ")).toBe("pending");
    expect(trimmedProposalStatusSchema.parse("  REJECTED  ")).toBe("rejected");
  });

  it("treats blank status as undefined", () => {
    expect(optionalProposalStatusSchema.parse("   ")).toBe(undefined);
  });
});

describe("trimmedTaskStatusSchema", () => {
  it("trims padded task status", () => {
    expect(trimmedTaskStatusSchema.parse("  backlog  ")).toBe("backlog");
    expect(optionalTaskStatusSchema.parse("  done  ")).toBe("done");
    expect(optionalTaskPrioritySchema.parse("  high  ")).toBe("high");
  });
});

describe("trimmed enum ingress", () => {
  it("trims required enum values", () => {
    expect(trimmedEntityKindSchema.parse("  person  ")).toBe("person");
    expect(trimmedEntityKindSchema.parse("  PERSON  ")).toBe("person");
    expect(trimmedClaimClassSchema.parse("  observation  ")).toBe(
      "observation"
    );
    expect(trimmedConfidenceTierSchema.parse("  possible  ")).toBe("possible");
    expect(trimmedIdentifierTypeSchema.parse("  email  ")).toBe("email");
    expect(trimmedIdentifierStatusSchema.parse("  current  ")).toBe("current");
    expect(trimmedEdgePredicateSchema.parse("  related_to  ")).toBe(
      "related_to"
    );
    expect(trimmedRetractKindSchema.parse("  retracted  ")).toBe("retracted");
  });

  it("trims optional enum values and treats blank as undefined", () => {
    expect(optionalEntityKindSchema.parse("  org  ")).toBe("org");
    expect(optionalClaimClassSchema.parse("   ")).toBe(undefined);
    expect(optionalConfidenceTierSchema.parse("  confirmed  ")).toBe(
      "confirmed"
    );
    expect(optionalIdentifierTypeSchema.parse("   ")).toBe(undefined);
    expect(optionalIdentifierStatusSchema.parse("  unknown  ")).toBe("unknown");
    expect(optionalEdgePredicateSchema.parse("   ")).toBe(undefined);
  });
});
