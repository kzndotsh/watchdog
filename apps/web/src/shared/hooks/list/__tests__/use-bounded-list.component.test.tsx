import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  useBoundedList,
  useLocalListSearch,
} from "@/shared/hooks/list/use-bounded-list";
import { choices, defineList, flag, opsOf } from "@watchdog/schemas/shared";

const catalog = defineList({
  name: "test-catalog",
  noun: { one: "entry", many: "entries" },
  scope: z.object({}),
  filters: {
    kind: choices("Kind", ["cap", "playbook"], {
      cap: "Cap",
      playbook: "Playbook",
    }),
    keyed: flag("Needs key"),
  },
  sorts: { title: { label: "Title", type: "text", dirs: ["asc"] } },
  defaultSort: "title.asc",
  search: { fields: ["title"], hint: "title" },
});

type Entry = { readonly id: string; readonly kind: "cap" | "playbook" };
const ENTRIES: readonly Entry[] = [
  { id: "dns", kind: "cap" },
  { id: "footprint", kind: "playbook" },
];

/** A screen: the list's view in component state, its rows filtered by the query. */
function useScreen(
  entries: readonly Entry[],
  options?: { isPending?: boolean }
) {
  const [search, onSearchChange] = useLocalListSearch<typeof catalog>({});
  const query = opsOf(catalog).queryOf(search);
  const kinds = query.filters.kind;
  const rows = entries.filter(
    (entry) => kinds.length === 0 || kinds.includes(entry.kind)
  );
  return useBoundedList(catalog, {
    rows,
    getId: (entry) => entry.id,
    totalRows: entries.length,
    isPending: options?.isPending,
    search,
    onSearchChange,
  });
}

describe("useBoundedList", () => {
  it("is ready with an exact count and no next page", () => {
    const { result } = renderHook(() => useScreen(ENTRIES));

    expect(result.current.status).toBe("ready");
    expect(result.current.count).toMatchObject({
      loaded: 2,
      total: { count: 2, isCapped: false },
      hasMore: false,
      isSettled: true,
    });
    expect(result.current.more.hasNextPage).toBe(false);
    expect(result.current.isFiltered).toBe(false);
  });

  it("is pending until the data arrives, and blank when there is none", () => {
    const pending = renderHook(() => useScreen([], { isPending: true }));
    expect(pending.result.current.status).toBe("pending");
    expect(pending.result.current.count.isSettled).toBe(false);

    const blank = renderHook(() => useScreen([]));
    expect(blank.result.current.status).toBe("blank");
  });

  it("a filter writes the canonical view, narrows the rows and reads as no-match, never blank", () => {
    const { result } = renderHook(() => useScreen(ENTRIES));

    act(() => {
      result.current.controls.setFilter("kind", ["playbook"]);
    });
    expect(result.current.query.filters.kind).toEqual(["playbook"]);
    expect(result.current.rows.map((row) => row.id)).toEqual(["footprint"]);
    expect(result.current.isFiltered).toBe(true);

    act(() => {
      result.current.controls.setFilter("keyed", true);
    });
    act(() => {
      result.current.controls.removeFilter("kind");
    });
    expect(result.current.query.filters).toEqual({ kind: [], keyed: true });

    act(() => {
      result.current.controls.reset();
    });
    expect(result.current.isFiltered).toBe(false);
    expect(result.current.rows).toHaveLength(2);
  });

  it("an empty view of loaded data is no-match, not blank", () => {
    const { result } = renderHook(() =>
      useBoundedList(catalog, {
        rows: [],
        getId: (entry: Entry) => entry.id,
        totalRows: 2,
        search: { kind: ["playbook"] },
        onSearchChange: () => undefined,
      })
    );

    expect(result.current.status).toBe("no-match");
  });
});
