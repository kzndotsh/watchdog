import type { CapProviderInfo } from "@/domains/jobs/types";

/** Why a Cap or Playbook can or cannot run for the viewer (the catalog's own gate). */
export type LibraryReadiness =
  | { state: "ready" }
  | { state: "needs_key"; slots: string[] }
  | { state: "off_by_operator" }
  | { state: "unavailable"; reason: string };

export type LibraryReadinessState = LibraryReadiness["state"];

export const LIBRARY_READINESS_STATES = [
  "ready",
  "needs_key",
  "off_by_operator",
  "unavailable",
] as const satisfies readonly LibraryReadinessState[];

export type CommercialUse = CapProviderInfo["commercialUse"];

export const COMMERCIAL_USE_VALUES = [
  "allowed",
  "restricted",
  "forbidden",
  "unknown",
] as const satisfies readonly CommercialUse[];

export type LibraryEntryKind = "cap" | "playbook";

/** One row of the Library: a Cap or a Playbook, as the viewer sees it. */
export type LibraryEntry = {
  /** `cap:<id>` or `playbook:<id>`: the URL's selection and the list key. */
  key: string;
  kind: LibraryEntryKind;
  id: string;
  title: string;
  description: string;
  /** Group id: a Cap's id category (`network`), or `playbook`. */
  category: string;
  categoryLabel: string;
  /** Provider names: a Cap's own, or the distinct providers of a Playbook's steps. */
  providers: string[];
  /** A Cap's provider terms; a Playbook takes its most restrictive step. */
  commercialUse: CommercialUse;
  /** The entry sends the viewer's input to a third party. Separate from readiness. */
  isThirdParty: boolean;
  /** Normalized input kinds it takes (see `lib/input-kinds.ts`). */
  inputKinds: string[];
  readiness: LibraryReadiness;
};

export type LibraryFilters = {
  q: string;
  /** "Start from what you have": an input kind key, or null for all. */
  inputKind: string | null;
  readiness: LibraryReadinessState[];
  isThirdPartyOnly: boolean;
  commercialUse: CommercialUse[];
};

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  q: "",
  inputKind: null,
  readiness: [],
  isThirdPartyOnly: false,
  commercialUse: [],
};

export type LibraryGroup = {
  id: string;
  label: string;
  entries: LibraryEntry[];
};

export type InputKindOption = {
  value: string;
  label: string;
  count: number;
};
