import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { listView, nextListCursor } from "@/shared/lib/list/list-view";
import { evidenceList } from "@watchdog/schemas/evidence";
import { LIST_MAX_PAGES, type ListPage } from "@watchdog/schemas/shared";

const page: ListPage<string> = { items: ["a"], nextCursor: "c1", total: null };

describe("listView", () => {
  it("keys every view under the domain's root and scope, ending in keyOf(query)", () => {
    const view = listView(evidenceList, {
      domain: "evidence",
      scopeKey: (caseId: string) => [caseId],
      getId: (row: string) => row,
      staleTime: 0,
      gcTime: 0,
      fetchPage: vi.fn(),
    });
    const query = evidenceList.queryOf({ kind: ["file"] });
    expect(view.key("case-1", query)).toEqual([
      "evidence",
      "case-1",
      "list",
      "evidence",
      evidenceList.keyOf(query),
    ]);
    expect(view.prefix("case-1")).toEqual([
      "evidence",
      "case-1",
      "list",
      "evidence",
    ]);
    expect(view.infinite("case-1", query).meta).toEqual({ isListView: true });
  });

  it("sends the canonical params, fixed filters included, and the cursor", async () => {
    const fetchPage = vi.fn(async () => page);
    const view = listView(evidenceList, {
      domain: "evidence",
      scopeKey: (caseId: string) => [caseId],
      getId: (row: string) => row,
      staleTime: 0,
      gcTime: 0,
      fetchPage,
    });
    const query = evidenceList.queryOf(
      {},
      { entityId: "00000000-0000-4000-8000-000000000001" }
    );
    await new QueryClient().infiniteQuery({
      ...view.infinite("case-1", query),
      pages: 2,
    });
    expect(fetchPage).toHaveBeenCalledWith({
      scope: "case-1",
      params: expect.objectContaining({
        entityId: "00000000-0000-4000-8000-000000000001",
      }),
      cursor: "c1",
    });
  });

  it("has no next page at the ceiling", () => {
    const pages = Array.from({ length: LIST_MAX_PAGES }, () => page);
    expect(nextListCursor(page, pages.slice(1))).toBe("c1");
    expect(nextListCursor(page, pages)).toBeUndefined();
  });
});
