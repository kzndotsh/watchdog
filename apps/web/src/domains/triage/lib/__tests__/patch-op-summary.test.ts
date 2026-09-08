import { describe, expect, it } from "vitest";

import { summarizePatchOpData } from "../patch-op-summary";

describe("summarizePatchOpData", () => {
  it("labels entity and identifier kinds", () => {
    expect(
      summarizePatchOpData("entity", { kind: "person", name: "Acme" })
    ).toBe("Person: Acme");
    expect(
      summarizePatchOpData("identifier", {
        type: "email",
        value: "ops@acme.test",
      })
    ).toBe("Email: ops@acme.test");
  });

  it("labels edge predicates", () => {
    expect(summarizePatchOpData("edge", { predicate: "hosted_on" })).toBe(
      "Hosted on"
    );
    expect(
      summarizePatchOpData("edge", {
        predicate: "hosted_on",
        notes: "CDN edge node",
      })
    ).toBe("Hosted on — CDN edge node");
  });

  it("handles partial event and identifier fields", () => {
    expect(summarizePatchOpData("event", { what: "Observed login" })).toBe(
      "Observed login"
    );
    expect(
      summarizePatchOpData("event", {
        when: "2024-01-15",
        what: "Registered domain",
        where: "Delaware",
      })
    ).toBe("2024-01-15 — Registered domain @ Delaware");
    expect(summarizePatchOpData("identifier", { value: "ops@acme.test" })).toBe(
      "Identifier: ops@acme.test"
    );
    expect(summarizePatchOpData("entity", { kind: "person" })).toBe("Person");
    expect(
      summarizePatchOpData("entity", { kind: "person", name: "Alice" })
    ).toBe("Person: Alice");
    expect(
      summarizePatchOpData("entity", {
        kind: "org",
        name: "Acme",
        summary: "Shell company",
        notes: "Delaware filing",
      })
    ).toBe("Org: Acme — Shell company · Delaware filing");
    expect(
      summarizePatchOpData("question", {
        text: "Who registered the domain?",
        resolvedNote: "Found in WHOIS",
      })
    ).toBe("Who registered the domain? → Found in WHOIS");
  });
});
