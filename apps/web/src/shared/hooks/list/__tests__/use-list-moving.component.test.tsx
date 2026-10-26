import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { useList } from "@/shared/hooks/list/use-list";
import { listView, type ListPageRequest } from "@/shared/lib/list/list-view";
import {
  testQueryClient,
  withClient,
} from "@/shared/ui/list/__tests__/list-test-fixtures";
import { collectList } from "@watchdog/schemas/jobs";
import type { ListPage } from "@watchdog/schemas/shared";

type Row = { readonly id: string };

const PAGES: Record<string, readonly string[]> = {
  first: ["a", "b"],
  second: ["b", "c"],
};

/** Page one is a, b; page two repeats b (it dropped past the cursor and came back), then c. */
async function fetchPage({
  cursor,
}: ListPageRequest<typeof collectList, "case">): Promise<ListPage<Row>> {
  const ids = PAGES[cursor === undefined ? "first" : "second"] ?? [];
  return {
    items: ids.map((id) => ({ id })),
    nextCursor: cursor === undefined ? "p2" : null,
    total: cursor === undefined ? { count: 4, isCapped: false } : null,
  };
}

const view = listView(collectList, {
  domain: "moving-harness",
  scopeKey: () => ["case"],
  getId: (row: Row) => row.id,
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
  fetchPage,
});

async function loadTwoPages(search: { sort?: "started.desc" }) {
  const { result } = renderHook(
    () =>
      useList(view, {
        scope: "case",
        search,
        onSearchChange: () => undefined,
      }),
    { wrapper: withClient(testQueryClient()) }
  );
  await waitFor(() => {
    expect(result.current.status).toBe("ready");
  });
  await act(async () => {
    await result.current.more.fetchNextPage();
  });
  await waitFor(() => {
    expect(result.current.more.hasNextPage).toBe(false);
  });
  return result;
}

describe("useList with a moving sort", () => {
  it("keeps the first occurrence of a row that reappears on page two", async () => {
    const result = await loadTwoPages({});
    expect(result.current.rows.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves a stable sort's rows as the server sent them", async () => {
    const result = await loadTwoPages({ sort: "started.desc" });
    expect(result.current.rows.map((row) => row.id)).toEqual([
      "a",
      "b",
      "b",
      "c",
    ]);
  });
});
