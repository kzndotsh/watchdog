import type {
  CollectRow,
  CollectRun,
  CollectRunRole,
  CollectState,
} from "@/domains/intake/types";

export type { CollectRow, CollectRun, CollectRunRole, CollectState };

export const COLLECT_STATE_FACET_OPTIONS = [
  { value: "queued", label: "Queued" },
  { value: "blocked", label: "Blocked" },
  { value: "running", label: "Running" },
  { value: "unprocessed", label: "Unprocessed" },
  { value: "landed", label: "Landed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
] as const satisfies readonly {
  readonly value: CollectState;
  readonly label: string;
}[];

export type CollectIndex = {
  readonly rows: readonly CollectRow[];
  readonly rowById: (id: string) => CollectRow | null;
  readonly titleForEvidence: (evidenceId: string) => string | null;
};

export type CollectFilters = {
  readonly q: string;
  readonly states: readonly CollectState[];
  readonly isHiddenOnly: boolean;
  readonly isUnprocessedOnly: boolean;
  readonly isUnattachedOnly: boolean;
  readonly capabilityIds: readonly string[];
};

export const EMPTY_COLLECT_FILTERS: CollectFilters = {
  q: "",
  states: [],
  isHiddenOnly: false,
  isUnprocessedOnly: false,
  isUnattachedOnly: false,
  capabilityIds: [],
};
