import { describe, expect, it } from "vitest";

import { isStaleCursorError, listStatus } from "@/shared/lib/list/list-status";

describe("listStatus", () => {
  const settled = {
    isPending: false,
    isFailed: false,
    rowCount: 0,
    isFiltered: false,
  };

  it("puts pending before error, rows and the empty states", () => {
    expect(listStatus({ ...settled, isPending: true, isFailed: true })).toBe(
      "pending"
    );
    expect(listStatus({ ...settled, isFailed: true })).toBe("error");
    expect(listStatus({ ...settled, rowCount: 3, isFiltered: true })).toBe(
      "ready"
    );
  });

  it("never reports blank while filtered", () => {
    expect(listStatus(settled)).toBe("blank");
    expect(listStatus({ ...settled, isFiltered: true })).toBe("no-match");
  });
});

describe("isStaleCursorError", () => {
  it("reads the API's data.code, or the message tail once a ServerFn dropped data", () => {
    expect(isStaleCursorError({ data: { code: "cursor_stale" } })).toBe(true);
    expect(
      isStaleCursorError(
        new Error(
          "This evidence cursor belongs to another sort, filter or search; start again from the first page"
        )
      )
    ).toBe(true);
    expect(isStaleCursorError({ data: { code: "invalid" } })).toBe(false);
    expect(isStaleCursorError(null)).toBe(false);
  });
});
