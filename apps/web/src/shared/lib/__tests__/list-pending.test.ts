import { describe, expect, it } from "vitest";

import { listPending } from "@/shared/lib/list-pending";

describe("listPending", () => {
  it("returns true while loading or before first fetch settles", () => {
    expect(
      listPending({ isFetched: false, isError: false, isLoading: true })
    ).toBe(true);
    expect(
      listPending({ isFetched: false, isError: false, isLoading: false })
    ).toBe(true);
  });

  it("returns false after fetch, on error, or when disabled", () => {
    expect(
      listPending({ isFetched: true, isError: false, isLoading: false })
    ).toBe(false);
    expect(
      listPending({ isFetched: false, isError: true, isLoading: true })
    ).toBe(false);
    expect(
      listPending(
        { isFetched: false, isError: false, isLoading: true },
        { enabled: false }
      )
    ).toBe(false);
  });
});
