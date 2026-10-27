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

/** One step of a Playbook: its Cap's readiness and the earlier steps it reads from. */
export type LibraryStep = {
  capId: string;
  /** The Cap's title, or its id when the catalog does not list it. */
  title: string;
  /** Earlier steps (indexes) this step depends on, transitively. */
  dependsOn: number[];
  readiness: LibraryReadiness;
};

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
  /** A Playbook's steps in order; empty for a Cap. */
  steps: LibraryStep[];
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
