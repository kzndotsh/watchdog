import type { DbExec } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";

/** What the reference predicates read about a seeded row (deleted, kind, entity, ...). */
export type ConformanceFacts = Readonly<
  Record<string, string | boolean | null>
>;

export type ConformanceRow = {
  /** Short name used by the hand-written orders (`e01`). */
  readonly tag: string;
  readonly id: string;
  readonly facts: ConformanceFacts;
};

/**
 * One declared list's behaviour fixture for core's `list-conformance.int.test.ts` (ADR-0007).
 * Every expectation is WRITTEN BY HAND from the rows below, never computed with the SQL under
 * test: the page order of every sort value, the rows each search finds (in the default sort),
 * and a plain predicate per filter.
 */
export type ListConformance = {
  readonly list: string;
  /** Small, so every walk crosses several pages and the ties sit on page boundaries. */
  readonly pageLimit: number;
  /** Every row seeded in the Case, hidden ones included. */
  readonly rows: readonly ConformanceRow[];
  /** Wipes nothing: seeds two Cases, the rows above in the first and one decoy in the second. */
  readonly seed: (
    exec: DbExec
  ) => Promise<{ readonly caseId: CaseId; readonly otherCaseId: CaseId }>;
  /** Per sort value: the tags of the default view (no filter, no `q`), in page order. */
  readonly orders: Readonly<Record<string, readonly string[]>>;
  /** Per filter: does a row pass the canonical value (`false`, `[]` and `null` included)? */
  readonly reference: Readonly<
    Record<string, (facts: ConformanceFacts, value: unknown) => boolean>
  >;
  /** Per filter: wire values to try, each alone. */
  readonly samples: Readonly<Record<string, readonly unknown[]>>;
  /** `q` (with optional wire filters) and the tags it finds, in the default sort. */
  readonly searches: readonly {
    readonly q: string;
    readonly filters?: Readonly<Record<string, unknown>>;
    readonly expect: readonly string[];
  }[];
};

/** A fixed instant plus `minutes`: equal minutes make equal sort keys (the ties). */
export function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 0, 1, 0, minutes));
}

/** Whether a canonical choices or tags value admits `fact` (an empty list admits everything). */
export function inChoices(value: unknown, fact: unknown): boolean {
  return !Array.isArray(value) || value.length === 0 || value.includes(fact);
}
