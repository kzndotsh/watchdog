import { describe, expect, it } from "vitest";

import { evidenceExtractAiInput } from "../input";

const EVIDENCE_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("evidence.extract.ai input", () => {
  it("trims padded evidence id and model", () => {
    expect(
      evidenceExtractAiInput.parse({
        evidenceId: `  ${EVIDENCE_ID}  `,
        model: "  gpt-4.1  ",
      })
    ).toEqual({
      evidenceId: EVIDENCE_ID,
      model: "gpt-4.1",
    });
  });

  it("collapses blank model to undefined", () => {
    expect(
      evidenceExtractAiInput.parse({
        evidenceId: EVIDENCE_ID,
        model: "   ",
      }).model
    ).toBeUndefined();
  });
});
