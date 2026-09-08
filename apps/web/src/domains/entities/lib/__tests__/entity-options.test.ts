import { describe, expect, it } from "vitest";

import {
  entityMatchesQuery,
  entityOptionsFromRecords,
} from "@/domains/entities/lib/entity-options";
import { testId } from "@watchdog/test-kit";

describe("entityOptionsFromRecords", () => {
  it("includes slug for combobox display fallbacks", () => {
    expect(
      entityOptionsFromRecords([
        {
          id: testId(1),
          caseId: testId(2),
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

describe("entityMatchesQuery", () => {
  it("matches slug when display label uses the entity name", () => {
    expect(
      entityMatchesQuery(
        { name: "Jane Doe", slug: "jane-doe", kind: "person" },
        "jane-doe"
      )
    ).toBe(true);
    expect(
      entityMatchesQuery(
        { name: "Jane Doe", slug: "jane-doe", kind: "person" },
        "jane doe"
      )
    ).toBe(true);
    expect(
      entityMatchesQuery(
        { name: "Jane Doe", slug: "jane-doe", kind: "person" },
        "unrelated"
      )
    ).toBe(false);
  });

  it("matches slugified query text when the entity name is blank", () => {
    expect(
      entityMatchesQuery(
        { name: "", slug: "acme-corp", kind: "org" },
        "Acme Corp"
      )
    ).toBe(true);
  });

  it("matches entity kind display label", () => {
    expect(
      entityMatchesQuery({ name: "Acme", slug: "acme", kind: "org" }, "org")
    ).toBe(true);
    expect(
      entityMatchesQuery({ name: "Acme", slug: "acme", kind: "org" }, "Org")
    ).toBe(true);
  });

  it("skips kind matching when kind is omitted", () => {
    expect(entityMatchesQuery({ name: "Acme", slug: "acme" }, "person")).toBe(
      false
    );
    expect(entityMatchesQuery({ name: "Acme", slug: "acme" }, "acme")).toBe(
      true
    );
  });
});
