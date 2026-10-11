import { describe, expect, it } from "vitest";

import { entityDossierPath } from "@/domains/entities/lib/entity-export";

describe("entityDossierPath", () => {
  it("encodes entity slug for dossier routes and copied links", () => {
    expect(entityDossierPath("alpha-corp")).toBe("/entities/alpha-corp");
    expect(entityDossierPath("acme/ops")).toBe("/entities/acme%2Fops");
  });
});
