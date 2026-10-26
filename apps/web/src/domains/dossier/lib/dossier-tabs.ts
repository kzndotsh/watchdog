import type { SearchSchemaInput } from "@tanstack/react-router";
import { z } from "zod";

import { tabSearchParam } from "@/shared/lib/tab-search";
import { evidenceList } from "@watchdog/schemas/evidence";
import { identifierList } from "@watchdog/schemas/graph";
import {
  optionalUuidSchema,
  type ListSearch,
  type SortValue,
  type UnfixedSearch,
} from "@watchdog/schemas/shared";

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

/** The Identifiers tab's view: the Case's Identifier list with `entityId` fixed (never in the URL). */
export type DossierIdentifiersSearch = UnfixedSearch<
  typeof identifierList,
  "entityId"
>;

/** The Evidence tab's view, plus the selected row (`id`), which may not be on a loaded page. */
export type DossierEvidenceSearch = UnfixedSearch<
  typeof evidenceList,
  "entityId"
> & { readonly id?: string };

/**
 * Route search for `/entities/$entitySlug`: the tab, and the view of the tab's list. Two tabs are
 * declared lists (ADR-0007) and both own `q` and `sort`, so the list params belong to the tab
 * in `tab` (`validateDossierSearch` keeps only that list's), and switching tabs starts the other
 * list at its default view. `tab` is absent for an invalid or missing value.
 */
export type DossierSearch = { readonly tab?: DossierTab } & Omit<
  ListSearch<typeof identifierList>,
  "sort" | "entityId"
> &
  Omit<ListSearch<typeof evidenceList>, "sort" | "entityId"> & {
    readonly id?: string;
    readonly sort?:
      | SortValue<typeof identifierList>
      | SortValue<typeof evidenceList>;
  };

/**
 * What a link may pass: any `tab` text (an unknown one lands on Overview), and the tab's list
 * params. `validateDossierSearch` parses it; an unusable value is dropped, never an error page.
 */
export type DossierSearchInput = Omit<DossierSearch, "tab"> & {
  readonly tab?: string;
};

const identifiersTabSearch = identifierList.searchWith({});
/** The Evidence tab's `?id=`: an unusable value selects nothing (never an error page). */
const selectedIdParam = z.preprocess(
  (value) => optionalUuidSchema.safeParse(value).data,
  z.string().optional()
);

const evidenceTabSearch = evidenceList.searchWith({ id: selectedIdParam });

/** The fixed filter never comes from the URL: a hand-typed `entityId` is dropped. */
function withoutEntityId<T extends { readonly entityId?: string }>(
  search: T
): Omit<T, "entityId"> {
  const { entityId: _fixed, ...rest } = search;
  return rest;
}

/** The Dossier URL's search, parsed: never throws; unknown or bad params are dropped. */
export function parseDossierSearch(
  raw: Readonly<Record<string, unknown>>
): DossierSearch {
  const tab = dossierTabParam.parse(raw.tab);
  if (tab === "identifiers") {
    return { ...withoutEntityId(identifiersTabSearch.parse(raw)), tab };
  }
  if (tab === "evidence") {
    return { ...withoutEntityId(evidenceTabSearch.parse(raw)), tab };
  }
  return tab === undefined ? {} : { tab };
}

/** The Dossier route's `validateSearch`: links pass `DossierSearchInput`. */
export function validateDossierSearch(
  raw: DossierSearchInput & SearchSchemaInput
): DossierSearch {
  return parseDossierSearch(raw);
}

/** The Identifiers tab's view (the Identifier list's params only); empty on another tab. */
export function identifiersTabView(
  search: DossierSearch
): DossierIdentifiersSearch {
  if (search.tab !== "identifiers") return {};
  return withoutEntityId(identifiersTabSearch.parse(search));
}

/** The Evidence tab's view and selection; empty on another tab. */
export function evidenceTabView(search: DossierSearch): DossierEvidenceSearch {
  if (search.tab !== "evidence") return {};
  return withoutEntityId(evidenceTabSearch.parse(search));
}

/** Only the tab, for loaders that warm by tab. */
export const dossierSearchSchema = z.object({ tab: dossierTabParam });

/** A tab value from anywhere (search, Tabs callback), resolved to a valid tab. */
export function resolveDossierTab(value: unknown): DossierTab {
  return dossierTabParam.parse(value) ?? DEFAULT_DOSSIER_TAB;
}
