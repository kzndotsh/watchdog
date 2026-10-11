import { z } from "zod";

import { tabSearchParam } from "@/shared/lib/tab-search";

/** Old Case overview tabs, each now its own first-class Active-Case route. */
export const CASE_LEGACY_TABS = [
  "entities",
  "identifiers",
  "graph",
  "tasks",
] as const;

export type CaseLegacyTab = (typeof CASE_LEGACY_TABS)[number];

export const CASE_LEGACY_TAB_REDIRECT = {
  entities: "/entities",
  identifiers: "/identifiers",
  graph: "/graph",
  tasks: "/tasks",
} as const satisfies Record<CaseLegacyTab, string>;

/** Route search for `/cases/$caseSlug`: only a legacy tab survives, anything else is dropped. */
export const caseOverviewSearchSchema = z.object({
  tab: tabSearchParam(CASE_LEGACY_TABS),
});
