import { describe, expect, it } from "vitest";

import {
  entityDossierPath,
  entityMarkdownExportPath,
} from "@/domains/entities/lib/entity-export";
import { testId } from "@watchdog/test-kit";

describe("entityMarkdownExportPath", () => {
  it("encodes entity slug for the API path", () => {
    const caseId = testId(10);
    expect(entityMarkdownExportPath(caseId, "alpha-corp")).toBe(
      `/api/v1/cases/${caseId}/entities/alpha-corp/export.md`
    );
    expect(entityMarkdownExportPath(caseId, "acme/ops")).toBe(
      `/api/v1/cases/${caseId}/entities/acme%2Fops/export.md`
    );
  });
});

describe("entityDossierPath", () => {
  it("encodes entity slug for dossier routes and copied links", () => {
    expect(entityDossierPath("alpha-corp")).toBe("/entities/alpha-corp");
    expect(entityDossierPath("acme/ops")).toBe("/entities/acme%2Fops");
  });
});
