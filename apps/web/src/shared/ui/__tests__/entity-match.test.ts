import { describe, expect, it } from "vitest";

import { entityMatchesQuery } from "@/shared/ui/entity-match";

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
