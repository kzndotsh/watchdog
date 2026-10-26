import {
  isProcessCapability,
  URL_ENRICH_CAPABILITY_ID,
} from "../job-artifacts";
import { JOB_INPUT_HINT_KEYS } from "../job-input-display";
import type { JsonObject } from "../json";
import { parseTrimmedUuid } from "../primitives";
import type { CollectRowKind, CollectRowState, JobStatus } from "../shared";

/**
 * The rules of Collect's queue projection (#574) restated in TypeScript: the oracle the SQL
 * (`collect_queue_compute`, migration `collect_queue_logic`) is tested against, and that is itself
 * tested against today's queue builder (`buildCollectIndex`, web). A rule change edits both.
 *
 * Times are microseconds since the epoch (Postgres keeps microseconds; a `Date` does not).
 */
export type CollectSourceEvidence = {
  readonly id: string;
  readonly capturedAt: number;
  readonly processedAt: number | null;
  readonly deletedAt: number | null;
  readonly entityId: string | null;
  readonly label: string | null;
  readonly notes: string | null;
  readonly sourceUrl: string | null;
};

export type CollectSourceJob = {
  readonly id: string;
  readonly capabilityId: string;
  readonly status: JobStatus;
  readonly input: JsonObject;
  readonly playbookRunId: string | null;
  readonly retryOfJobId: string | null;
  /** `job_evidence` in landing order. */
  readonly evidenceIds: readonly string[];
  readonly createdAt: number;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly resultSummary: string | null;
  readonly error: string | null;
  readonly interpretError: string | null;
};

export type CollectSourceRun = {
  readonly id: string;
  readonly playbookId: string;
  readonly createdAt: number;
};

/** One Case's source rows. */
export type CollectSource = {
  readonly evidence: readonly CollectSourceEvidence[];
  readonly jobs: readonly CollectSourceJob[];
  readonly runs: readonly CollectSourceRun[];
};

export type CollectQueueRowFact = {
  readonly id: string;
  readonly kind: CollectRowKind;
  readonly sortAt: number;
  readonly activityAt: number;
  readonly state: CollectRowState;
  readonly entityId: string | null;
  readonly capabilityIds: readonly string[];
  readonly searchText: string;
  /** Member Job ids, sorted. */
  readonly members: readonly string[];
};

const EVIDENCE_PART_MAX = 500;
const MEMBER_PART_MAX = 200;
const SEARCH_TEXT_MAX = 4000;

/** Byte order of the C collation, which is code point order for these ASCII-heavy strings. */
function compareC(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Postgres `left(s, n)`: the first `n` characters (code points). */
function leftChars(value: string, n: number): string {
  let out = "";
  let count = 0;
  for (const char of value) {
    if (count === n) break;
    out += char;
    count += 1;
  }
  return out;
}

function evidenceState(row: CollectSourceEvidence): CollectRowState {
  if (row.deletedAt !== null) return "hidden";
  return row.processedAt === null ? "unprocessed" : "landed";
}

function inputEvidenceIds(input: CollectSourceJob["input"]): string[] {
  const out: string[] = [];
  for (const key of ["evidenceId", "sourceEvidenceId"] as const) {
    const value = input[key];
    if (typeof value !== "string") continue;
    const parsed = parseTrimmedUuid(value);
    // The builder compares the parsed id with a stored (lowercase) id, so only a lowercase one links.
    if (parsed !== null && parsed === parsed.toLowerCase()) out.push(parsed);
  }
  return out;
}

function linksByInput(job: CollectSourceJob): boolean {
  return (
    isProcessCapability(job.capabilityId) ||
    job.capabilityId === URL_ENRICH_CAPABILITY_ID ||
    job.playbookRunId !== null
  );
}

/** The Evidence ids a Job could attach to (R1). */
export function collectCandidates(job: CollectSourceJob): Set<string> {
  if (job.evidenceIds.length > 1) return new Set();
  const out = new Set(job.evidenceIds);
  if (linksByInput(job)) {
    for (const id of inputEvidenceIds(job.input)) out.add(id);
  }
  return out;
}

function inputText(input: CollectSourceJob["input"]): string {
  const parts: string[] = [];
  for (const key of JOB_INPUT_HINT_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value !== "") parts.push(value);
  }
  return parts.join(" ");
}

function rowState(statuses: readonly JobStatus[]): CollectRowState {
  for (const status of ["running", "queued", "failed", "cancelled"] as const) {
    if (statuses.includes(status)) return status;
  }
  return "landed";
}

function maxOf(values: readonly (number | null)[]): number {
  let best = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value !== null && value > best) best = value;
  }
  return best;
}

function capabilityIdsOf(
  members: readonly CollectSourceJob[],
  runs: ReadonlyMap<string, CollectSourceRun>
): string[] {
  const ids = new Set<string>();
  for (const job of members) {
    ids.add(job.capabilityId);
    const run =
      job.playbookRunId === null ? undefined : runs.get(job.playbookRunId);
    if (run !== undefined) ids.add(run.playbookId);
  }
  return [...ids].sort(compareC);
}

function searchTextOf(
  evidence: CollectSourceEvidence | null,
  capabilityIds: readonly string[],
  members: readonly CollectSourceJob[]
): string {
  const parts: string[] = [];
  if (evidence !== null) {
    for (const part of [evidence.label, evidence.notes, evidence.sourceUrl]) {
      if (part !== null) parts.push(leftChars(part, EVIDENCE_PART_MAX));
    }
  }
  for (const id of capabilityIds) {
    parts.push(id, id.replaceAll(/[._-]/g, " "));
  }
  const ordered = [...members].sort(
    (a, b) => a.createdAt - b.createdAt || compareC(a.id, b.id)
  );
  for (const job of ordered) {
    for (const part of [
      job.resultSummary,
      job.error,
      job.interpretError,
      inputText(job.input),
    ]) {
      if (part !== null) parts.push(leftChars(part, MEMBER_PART_MAX));
    }
  }
  return leftChars(
    parts.filter((part) => part !== "").join(" "),
    SEARCH_TEXT_MAX
  );
}

/** Group values under a key, creating the bucket on first use. */
function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const bucket = map.get(key);
  if (bucket === undefined) map.set(key, [value]);
  else bucket.push(value);
}

/**
 * The queue rows of one Case, sorted by id: every Evidence row (hidden ones included, with no
 * members), every run with an unattached step, and every unattached Job with no run.
 */
export function collectQueueReference(
  source: CollectSource
): CollectQueueRowFact[] {
  const runs = new Map(source.runs.map((run) => [run.id, run]));
  const evidenceById = new Map(source.evidence.map((row) => [row.id, row]));
  const membersByEvidence = new Map<string, CollectSourceJob[]>();
  const membersByRow = new Map<string, CollectSourceJob[]>();
  const hiddenAt = new Map<string, number | null>();

  for (const job of source.jobs) {
    const candidates = [...collectCandidates(job)];
    const attached = candidates.filter((id) => {
      const row = evidenceById.get(id);
      return row !== undefined && row.deletedAt === null;
    });
    if (attached.length > 0) {
      for (const id of attached) push(membersByEvidence, id, job);
      continue;
    }
    push(membersByRow, job.playbookRunId ?? job.id, job);
    hiddenAt.set(
      job.id,
      maxOf(candidates.map((id) => evidenceById.get(id)?.deletedAt ?? null))
    );
  }

  const rows: CollectQueueRowFact[] = [];
  for (const row of source.evidence) {
    const members = membersByEvidence.get(row.id) ?? [];
    const capabilityIds = capabilityIdsOf(members, runs);
    rows.push({
      id: row.id,
      kind: "evidence",
      sortAt: row.capturedAt,
      activityAt: row.capturedAt,
      state: evidenceState(row),
      entityId: row.entityId,
      capabilityIds,
      searchText: searchTextOf(row, capabilityIds, members),
      members: members.map((job) => job.id).sort(compareC),
    });
  }
  for (const [id, members] of membersByRow) {
    const isRun = members.some((job) => job.playbookRunId === id);
    const run = isRun ? runs.get(id) : undefined;
    const retried = new Set(
      members.flatMap((job) =>
        job.retryOfJobId === null ? [] : [job.retryOfJobId]
      )
    );
    const capabilityIds = capabilityIdsOf(members, runs);
    rows.push({
      id,
      kind: isRun ? "run" : "job",
      sortAt:
        run?.createdAt ?? Math.min(...members.map((job) => job.createdAt)),
      activityAt: maxOf(
        members.flatMap((job) => [
          job.createdAt,
          job.startedAt,
          job.finishedAt,
          hiddenAt.get(job.id) ?? null,
        ])
      ),
      state: rowState(
        members.filter((job) => !retried.has(job.id)).map((job) => job.status)
      ),
      entityId: null,
      capabilityIds,
      searchText: searchTextOf(null, capabilityIds, members),
      members: members.map((job) => job.id).sort(compareC),
    });
  }
  return rows.sort((a, b) => compareC(a.id, b.id));
}
