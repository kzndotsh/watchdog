import { describe, expect, it } from "vitest";

import {
  createEntityInputSchema,
  updateEntityFieldsInputSchema,
} from "@/domains/entities/types";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("createEntityInputSchema", () => {
  it("slugifies name when slug is omitted", () => {
    const parsed = createEntityInputSchema.parse({
      caseId: CASE_ID,
      kind: "person",
      name: "Jane Doe",
    });
    expect(parsed.slug).toBe("jane-doe");
    expect(parsed.name).toBe("Jane Doe");
  });

  it("normalizes an explicit slug", () => {
    const parsed = createEntityInputSchema.parse({
      caseId: CASE_ID,
      kind: "org",
      name: "Acme Corp",
      slug: "  Alpha Corp  ",
    });
    expect(parsed.slug).toBe("alpha-corp");
  });

  it("falls back to slugifyName when slug is whitespace", () => {
    const parsed = createEntityInputSchema.parse({
      caseId: CASE_ID,
      kind: "person",
      name: "Jane Doe",
      slug: "   ",
    });
    expect(parsed.slug).toBe("jane-doe");
  });
});

describe("updateEntityFieldsInputSchema", () => {
  const entityId = "550e8400-e29b-41d4-a716-446655440010";

  it("clears summary when an empty string is sent", () => {
    expect(
      updateEntityFieldsInputSchema.parse({
        caseId: CASE_ID,
        entityId,
        summary: "",
      }).summary
    ).toBeNull();
  });
});
