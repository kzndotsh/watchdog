import type { DbExec } from "@watchdog/db";

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

/** What a fixture's `seed` hands back: the scope the rows are in, a decoy scope, and the wire params that name the first. */
export type SeededScopes = {
  /** The scope core passes (`{ caseId }`, or `{ organizationId }` for an organization-wide list). */
  readonly scope: Readonly<Record<string, string>>;
  /** The decoy's scope: its rows match every search and sort first, and must never appear. */
  readonly otherScope: Readonly<Record<string, string>>;
  /** The scope params a request carries (`{ caseId }`; empty when the organization comes from the caller). */
  readonly wire: Readonly<Record<string, string>>;
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
  /**
   * Wipes nothing: seeds two scopes (two Cases, or two organizations), the rows above in the
   * first and one decoy in the second.
   */
  readonly seed: (exec: DbExec) => Promise<SeededScopes>;
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
