import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";

/** What the investigator sees in the state column. Derived, never stored. */
export type CollectState =
  | "queued"
  | "running"
  | "unprocessed"
  | "landed"
  | "failed"
  | "hidden";

/** Queue filter facets — `hidden` uses `hiddenOnly`, not this list. */
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

/** Why a Job is attached to this row. Classification is private to collect-index. */
export type CollectRunRole = "collect" | "enrich" | "process" | "step";

export interface CollectRun {
  readonly job: JobListRecord;
  readonly role: CollectRunRole;
}

/**
 * One acquisition. Evidence and the Jobs around it are the same row — not a
 * union the caller switches on.
 */
export interface CollectRow {
  readonly id: string;
  readonly title: string;
  readonly hint: string | null;
  readonly state: CollectState;
  readonly when: string;
  readonly entityId: string | null;
  readonly evidence: EvidenceRecord | null;
  readonly runs: readonly CollectRun[];
  readonly playbookRunId: string | null;
  readonly recipe: { readonly step: number; readonly total: number } | null;
}

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
