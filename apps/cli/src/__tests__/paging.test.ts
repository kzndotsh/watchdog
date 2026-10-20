import { describe, expect, it, vi } from "vitest";

import { PAGE_LIMIT_MAX } from "@watchdog/schemas/shared";
import type { Page } from "@watchdog/schemas/shared";

import { CliExitError, emitList } from "../io";
import { fetchAllItems, fetchListPage, pageArgs } from "../paging";
import type { PageParams } from "../paging";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

/** A fake paged API over `total` rows: the cursor is the index of the next row. */
function fakeApi(total: number) {
  const calls: PageParams[] = [];
  const fetchPage = async (params: PageParams): Promise<Page<number>> => {
    calls.push(params);
    const size = params.limit ?? 50;
    const start = params.cursor === undefined ? 0 : Number(params.cursor);
    const items = Array.from(
      { length: Math.max(0, Math.min(size, total - start)) },
      (_, index) => start + index
    );
    const next = start + items.length;
    return { items, nextCursor: next < total ? String(next) : null };
  };
  return { calls, fetchPage };
}

describe("paging flags", () => {
  it("offers --limit, --cursor and --all", () => {
    expect(Object.keys(pageArgs)).toEqual(["limit", "cursor", "all"]);
    expect(pageArgs.all.default).toBe(false);
  });
});

describe("fetchListPage", () => {
  it("reads one page by default and hands back the cursor of the next", async () => {
    const api = fakeApi(120);
    const page = await fetchListPage(api.fetchPage, {});
    expect(api.calls).toEqual([{}]);
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBe("50");
  });

  it("passes --limit and --cursor through", async () => {
    const api = fakeApi(10);
    const page = await fetchListPage(api.fetchPage, {
      limit: "3",
      cursor: "  4  ",
    });
    expect(api.calls).toEqual([{ limit: 3, cursor: "4" }]);
    expect(page.items).toEqual([4, 5, 6]);
    expect(page.nextCursor).toBe("7");
  });

  it("with --all reads every page, and the result has no next cursor", async () => {
    const api = fakeApi(450);
    const page = await fetchListPage(api.fetchPage, { all: true });
    expect(page.items).toEqual(Array.from({ length: 450 }, (_, i) => i));
    expect(page.nextCursor).toBeNull();
    // 200 + 200 + 50: the largest page each time.
    expect(api.calls.map((call) => call.limit)).toEqual([
      PAGE_LIMIT_MAX,
      PAGE_LIMIT_MAX,
      PAGE_LIMIT_MAX,
    ]);
    expect(api.calls.map((call) => call.cursor)).toEqual([
      undefined,
      "200",
      "400",
    ]);
  });

  it("with --all and --limit reads every page at that size, from the cursor on", async () => {
    const api = fakeApi(10);
    const page = await fetchListPage(api.fetchPage, {
      all: true,
      limit: "4",
      cursor: "2",
    });
    expect(page.items).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(api.calls.map((call) => call.limit)).toEqual([4, 4]);
  });

  it("stops a single --all page at an empty list", async () => {
    const api = fakeApi(0);
    const page = await fetchListPage(api.fetchPage, { all: true });
    expect(page).toEqual({ items: [], nextCursor: null });
    expect(api.calls).toHaveLength(1);
  });

  it.each(["0", "-1", "201", "abc", "1.5", ""])(
    "refuses --limit %j as a usage error without calling the API",
    async (limit) => {
      const api = fakeApi(5);
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        await expect(fetchListPage(api.fetchPage, { limit })).rejects.toThrow(
          CliExitError
        );
        expect(log).toHaveBeenCalledWith(expect.stringContaining('"USAGE"'));
      } finally {
        log.mockRestore();
      }
      expect(api.calls).toEqual([]);
    }
  );
});

describe("fetchAllItems", () => {
  it("reads every page of a list for a lookup", async () => {
    const api = fakeApi(405);
    const items = await fetchAllItems(api.fetchPage);
    expect(items).toHaveLength(405);
    expect(api.calls).toHaveLength(3);
  });
});

describe("emitList with a paged result", () => {
  function emitted(input: Parameters<typeof emitList>[0]): unknown {
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
      lines.push(String(msg));
    });
    try {
      emitList(input);
    } finally {
      log.mockRestore();
    }
    return JSON.parse(lines[0] ?? "null");
  }

  it("prints nextCursor beside count and items so an agent can continue", () => {
    expect(
      emitted({ items: [{ id: "a" }], nextCursor: "abc", help: [] })
    ).toMatchObject({ count: 1, items: [{ id: "a" }], nextCursor: "abc" });
  });

  it("prints a null nextCursor on the last page and none for an unpaged list", () => {
    expect(emitted({ items: [], nextCursor: null })).toMatchObject({
      nextCursor: null,
    });
    expect(emitted({ items: [] })).not.toHaveProperty("nextCursor");
  });
});
