import { describe, expect, it } from "vitest";

import { entityDossierPath } from "@/domains/entities/lib/entity-export";

describe("entityDossierPath", () => {
  it("carries the Case slug and encodes both slugs for copied links", () => {
    expect(entityDossierPath("case-a", "alpha-corp")).toBe(
      "/cases/case-a/entities/alpha-corp"
    );
    expect(entityDossierPath("case-a", "acme/ops")).toBe(
      "/cases/case-a/entities/acme%2Fops"
    );
  });
});
