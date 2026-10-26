import type { UseQueryResult } from "@tanstack/react-query";

import { listPending } from "@/shared/lib/list-pending";

/** The counts of the tabs that read whole lists; Identifiers and Evidence come from their list totals. */
type DossierTabCounts = {
  claims: number;
  connections: number;
  events: number;
  questions: number;
  tasks: number;
};

const EMPTY_ROWS: never[] = [];

export function dataOrEmpty<T>(data: readonly T[] | undefined): readonly T[] {
  if (data === undefined) return EMPTY_ROWS;
  return data;
}

export function anyQueryPending(
  queries: readonly Pick<
    UseQueryResult,
    "isFetched" | "isError" | "isLoading"
  >[]
): boolean {
  for (const query of queries) {
    if (listPending(query)) return true;
  }
  return false;
}

export function dossierTabCounts(
  claimsRaw: readonly { retracted: boolean }[],
  edges: readonly unknown[],
  events: readonly unknown[],
  questions: readonly { status: string }[],
  /** The Entity's open Tasks: the board's cards (`tasks.board`), never the whole Task list. */
  openTasks: number
): DossierTabCounts {
  return {
    claims: claimsRaw.filter((claim) => !claim.retracted).length,
    connections: edges.length,
    events: events.length,
    questions: questions.filter((question) => question.status === "open")
      .length,
    tasks: openTasks,
  };
}
