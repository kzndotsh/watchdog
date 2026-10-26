import type { SearchSchemaInput } from "@tanstack/react-router";
import { z } from "zod";

import { tabSearchParam } from "@/shared/lib/tab-search";
import { evidenceList } from "@watchdog/schemas/evidence";
import {
  claimList,
  edgeList,
  eventList,
  identifierList,
  questionList,
} from "@watchdog/schemas/graph";
import {
  optionalUuidSchema,
  type ListSearch,
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

/**
 * The tabs that are a declared list (ADR-0007): each is the Case's list with `entityId` fixed,
 * and its view lives in the URL while it is the active tab.
 */
type ListTabs = {
  readonly claims: typeof claimList;
  readonly identifiers: typeof identifierList;
  readonly connections: typeof edgeList;
  readonly evidence: typeof evidenceList;
  readonly events: typeof eventList;
  readonly questions: typeof questionList;
};

/** A list tab's view: its list's params, never the fixed `entityId`. */
export type DossierListView<T extends keyof ListTabs> = UnfixedSearch<
  ListTabs[T],
  "entityId"
>;

export type DossierClaimsSearch = DossierListView<"claims">;
export type DossierIdentifiersSearch = DossierListView<"identifiers">;
export type DossierConnectionsSearch = DossierListView<"connections">;
export type DossierEventsSearch = DossierListView<"events">;
export type DossierQuestionsSearch = DossierListView<"questions">;

/** The Evidence tab's view, plus the selected row (`id`), which may not be on a loaded page. */
export type DossierEvidenceSearch = DossierListView<"evidence"> & {
  readonly id?: string;
};

type AnyTabSearch = {
  [T in keyof ListTabs]: Omit<ListSearch<ListTabs[T]>, "entityId">;
}[keyof ListTabs];

/** One optional key per param of any list tab, typed as the union of what the tabs give it. */
type MergedTabSearch = {
  readonly [
    K in AnyTabSearch extends unknown ? keyof AnyTabSearch : never
  ]?: AnyTabSearch extends unknown
    ? K extends keyof AnyTabSearch
      ? AnyTabSearch[K]
      : never
    : never;
};

/**
 * Route search for `/entities/$entitySlug`: the tab, and the view of the tab's list. Six tabs are
 * declared lists and all own `q` and `sort`, so the list params belong to the tab in `tab`
 * (`validateDossierSearch` keeps only that list's), and switching tabs starts the other list at
 * its default view. `tab` is absent for an invalid or missing value.
 */
export type DossierSearch = { readonly tab?: DossierTab } & MergedTabSearch & {
    readonly id?: string;
  };

/**
 * What a link may pass: any `tab` text (an unknown one lands on Overview), and the tab's list
 * params. `validateDossierSearch` parses it; an unusable value is dropped, never an error page.
 */
export type DossierSearchInput = Omit<DossierSearch, "tab"> & {
  readonly tab?: string;
};

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

type RawSearch = Readonly<Record<string, unknown>>;

/* Each list tab's URL params, parsed from anything (unknown or bad params are dropped). */
const claimsTabSearch = claimList.searchWith({});
const identifiersTabSearch = identifierList.searchWith({});
const connectionsTabSearch = edgeList.searchWith({});
const eventsTabSearch = eventList.searchWith({});
const questionsTabSearch = questionList.searchWith({});

const parseClaimsTab = (raw: RawSearch): DossierClaimsSearch =>
  withoutEntityId(claimsTabSearch.parse(raw));
const parseIdentifiersTab = (raw: RawSearch): DossierIdentifiersSearch =>
  withoutEntityId(identifiersTabSearch.parse(raw));
const parseConnectionsTab = (raw: RawSearch): DossierConnectionsSearch =>
  withoutEntityId(connectionsTabSearch.parse(raw));
const parseEventsTab = (raw: RawSearch): DossierEventsSearch =>
  withoutEntityId(eventsTabSearch.parse(raw));
const parseQuestionsTab = (raw: RawSearch): DossierQuestionsSearch =>
  withoutEntityId(questionsTabSearch.parse(raw));

function parseEvidenceTab(
  raw: Readonly<Record<string, unknown>>
): DossierEvidenceSearch {
  return withoutEntityId(evidenceTabSearch.parse(raw));
}

/** The active tab's list params: another tab's (or a non-list tab's) are dropped. */
function tabParams(
  tab: DossierTab | undefined,
  raw: Readonly<Record<string, unknown>>
): MergedTabSearch & { readonly id?: string } {
  switch (tab) {
    case "claims": {
      return parseClaimsTab(raw);
    }
    case "identifiers": {
      return parseIdentifiersTab(raw);
    }
    case "connections": {
      return parseConnectionsTab(raw);
    }
    case "evidence": {
      return parseEvidenceTab(raw);
    }
    case "events": {
      return parseEventsTab(raw);
    }
    case "questions": {
      return parseQuestionsTab(raw);
    }
    case "overview":
    case "notes":
    case "tasks":
    case undefined: {
      return {};
    }
    default: {
      return tab satisfies never;
    }
  }
}

/** The Dossier URL's search, parsed: never throws; unknown or bad params are dropped. */
export function parseDossierSearch(
  raw: Readonly<Record<string, unknown>>
): DossierSearch {
  const tab = dossierTabParam.parse(raw.tab);
  return tab === undefined ? {} : { ...tabParams(tab, raw), tab };
}

/** The Dossier route's `validateSearch`: links pass `DossierSearchInput`. */
export function validateDossierSearch(
  raw: DossierSearchInput & SearchSchemaInput
): DossierSearch {
  return parseDossierSearch(raw);
}

/** The Claims tab's view (the Claim list's params only); empty on another tab. */
export function claimsTabView(search: DossierSearch): DossierClaimsSearch {
  return search.tab === "claims" ? parseClaimsTab(search) : {};
}

/** The Identifiers tab's view (the Identifier list's params only); empty on another tab. */
export function identifiersTabView(
  search: DossierSearch
): DossierIdentifiersSearch {
  return search.tab === "identifiers" ? parseIdentifiersTab(search) : {};
}

/** The Connections tab's view (the Connection list's params only); empty on another tab. */
export function connectionsTabView(
  search: DossierSearch
): DossierConnectionsSearch {
  return search.tab === "connections" ? parseConnectionsTab(search) : {};
}

/** The Evidence tab's view and selection; empty on another tab. */
export function evidenceTabView(search: DossierSearch): DossierEvidenceSearch {
  return search.tab === "evidence" ? parseEvidenceTab(search) : {};
}

/** The Events tab's view (the Event list's params only); empty on another tab. */
export function eventsTabView(search: DossierSearch): DossierEventsSearch {
  return search.tab === "events" ? parseEventsTab(search) : {};
}

/** The Questions tab's view (the Question list's params only); empty on another tab. */
export function questionsTabView(
  search: DossierSearch
): DossierQuestionsSearch {
  return search.tab === "questions" ? parseQuestionsTab(search) : {};
}

/** A tab value from anywhere (search, Tabs callback), resolved to a valid tab. */
export function resolveDossierTab(value: unknown): DossierTab {
  return dossierTabParam.parse(value) ?? DEFAULT_DOSSIER_TAB;
}
