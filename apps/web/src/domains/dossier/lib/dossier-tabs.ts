import { z } from "zod";

import { tabSearchParam } from "@/shared/lib/tab-search";

/** The one definition of the Dossier tabs, in display order. Types and parsers derive from it. */
export const DOSSIER_TABS = [
  "overview",
  "notes",
  "claims",
  "identifiers",
  "connections",
  "evidence",
  "events",
  "questions",
  "tasks",
] as const;

export type DossierTab = (typeof DOSSIER_TABS)[number];

export const DEFAULT_DOSSIER_TAB: DossierTab = "overview";

const dossierTabParam = tabSearchParam(DOSSIER_TABS);

/** Route search for `/entities/$entitySlug`: `tab` is absent for an invalid or missing value. */
export const dossierSearchSchema = z.object({ tab: dossierTabParam });

/** A tab value from anywhere (search, Tabs callback), resolved to a valid tab. */
export function resolveDossierTab(value: unknown): DossierTab {
  return dossierTabParam.parse(value) ?? DEFAULT_DOSSIER_TAB;
}
