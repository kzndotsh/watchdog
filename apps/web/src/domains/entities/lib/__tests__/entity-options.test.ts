import { describe, expect, it } from "vitest";

import { entityOptionsFromRecords } from "@/domains/entities/lib/entity-options";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

describe("entityOptionsFromRecords", () => {
  it("includes slug for combobox display fallbacks", () => {
    expect(
      entityOptionsFromRecords([
        {
          id: testId(1),
          caseId: testCaseId(2),
          kind: "org",
          name: "",
          slug: "acme-corp",
          summary: null,
          notes: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ])
    ).toEqual([
      {
        id: testId(1),
        name: "",
        kind: "org",
        slug: "acme-corp",
      },
    ]);
  });
});
