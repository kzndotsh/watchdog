import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { listView, type ListPageRequest } from "@/shared/lib/list/list-view";
import { evidenceList } from "@watchdog/schemas/evidence";
import type { EvidenceKind, ListPage } from "@watchdog/schemas/shared";

/** A fake Evidence row: only what the harness filters and shows. */
export type HarnessRow = {
  readonly id: string;
  readonly label: string;
  readonly kind: EvidenceKind;
  readonly entityId: string | null;
};

export const ACME_ID = "00000000-0000-4000-8000-00000000a001";
export const NORTH_ID = "00000000-0000-4000-8000-00000000a002";

export function harnessRows(count: number): HarnessRow[] {
  return Array.from({ length: count }, (_, n) => ({
    id: `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
    label: `Item ${n + 1}`,
    kind: n % 2 === 0 ? "file" : "url_archive",
    entityId: n % 3 === 0 ? ACME_ID : NORTH_ID,
  }));
}

type EvidenceRequest = ListPageRequest<typeof evidenceList, "case">;

/** An in-memory `fetchPage` over `rows`: filters, `q`, offset cursors and a total on page one. */
export function memoryFetch(rows: readonly HarnessRow[]) {
  return async ({
    params,
    cursor,
  }: EvidenceRequest): Promise<ListPage<HarnessRow>> => {
    // No harness row is hidden: the Hidden view is empty.
    const matched = rows.filter(
      (row) =>
        params.hidden !== true &&
        (params.kind === undefined || params.kind.includes(row.kind)) &&
        (params.entityId === undefined || params.entityId === row.entityId) &&
        (params.q === undefined || row.label.includes(params.q))
    );
    const start = cursor === undefined ? 0 : Number(cursor);
    const items = matched.slice(start, start + 50);
    const end = start + items.length;
    return {
      items,
      nextCursor: end < matched.length ? String(end) : null,
      total:
        cursor === undefined
          ? { count: matched.length, isCapped: false }
          : null,
    };
  };
}

export function harnessView(
  fetchPage: (request: EvidenceRequest) => Promise<ListPage<HarnessRow>>
) {
  return listView(evidenceList, {
    domain: "harness",
    scopeKey: () => ["case"],
    getId: (row: HarnessRow) => row.id,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    fetchPage,
  });
}

export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

export function withClient(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}
