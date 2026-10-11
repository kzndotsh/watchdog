import { describe, expect, it } from "vitest";

import {
  DEFAULT_DOSSIER_TAB,
  DOSSIER_LEGACY_TABS,
  DOSSIER_TABS,
  dossierSearchSchema,
  resolveDossierTab,
} from "@/domains/dossier/lib/dossier-tabs";

describe("dossier tabs", () => {
  it("opens on a tab that exists", () => {
    expect(DOSSIER_TABS).toContain(DEFAULT_DOSSIER_TAB);
  });

  it.each(DOSSIER_TABS)("keeps the %s tab unchanged", (tab) => {
    expect(dossierSearchSchema.parse({ tab })).toEqual({ tab });
    expect(resolveDossierTab(tab)).toBe(tab);
  });

  it("falls back to the default tab for an invalid or missing value", () => {
    expect(dossierSearchSchema.parse({ tab: "nope" }).tab).toBeUndefined();
    expect(resolveDossierTab("nope")).toBe(DEFAULT_DOSSIER_TAB);
    expect(resolveDossierTab(undefined)).toBe(DEFAULT_DOSSIER_TAB);
  });

  it("sends every legacy name to a tab that exists", () => {
    for (const [legacy, tab] of Object.entries(DOSSIER_LEGACY_TABS)) {
      expect(DOSSIER_TABS).toContain(tab);
      expect(resolveDossierTab(legacy)).toBe(tab);
    }
  });
});
