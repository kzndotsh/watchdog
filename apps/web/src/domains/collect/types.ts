import type {
  CollectRow,
  CollectRun,
  CollectRunRole,
  CollectState,
} from "@/domains/intake/types";

export type { CollectRow, CollectRun, CollectRunRole, CollectState };

export const COLLECT_STATE_FACET_OPTIONS = [
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "unprocessed", label: "Unprocessed" },
  { value: "landed", label: "Landed" },
  { value: "failed", label: "Failed" },
] as const satisfies readonly {
  readonly value: CollectState;
  readonly label: string;
}[];

export interface CollectIndex {
  readonly rows: readonly CollectRow[];
  readonly rowById: (id: string) => CollectRow | null;
  readonly titleForEvidence: (evidenceId: string) => string | null;
}

export interface CollectFilters {
  readonly q: string;
  readonly states: readonly CollectState[];
  readonly hiddenOnly: boolean;
  readonly unprocessedOnly: boolean;
  readonly unattachedOnly: boolean;
  readonly capabilityIds: readonly string[];
}

export const EMPTY_COLLECT_FILTERS: CollectFilters = {
  q: "",
  states: [],
  hiddenOnly: false,
  unprocessedOnly: false,
  unattachedOnly: false,
  capabilityIds: [],
};
