import { describe, expect, it } from "vitest";

import {
  caseExportZipPath,
  entityMarkdownExportPath,
} from "@/shared/lib/api-urls";

const CASE_ID = "11111111-1111-4111-8111-111111111111";

describe("api urls", () => {
  it("builds the Case export zip path", () => {
    expect(caseExportZipPath(CASE_ID)).toBe(
      `/api/v1/cases/${CASE_ID}/export.zip`
    );
  });

  it("builds the Entity Markdown export path", () => {
    expect(entityMarkdownExportPath(CASE_ID, "alpha-corp")).toBe(
      `/api/v1/cases/${CASE_ID}/entities/alpha-corp/export.md`
    );
  });

  it("encodes a slug that would escape its path segment", () => {
    expect(entityMarkdownExportPath(CASE_ID, "acme/ops")).toBe(
      `/api/v1/cases/${CASE_ID}/entities/acme%2Fops/export.md`
    );
  });
});
