import { describe, expect, it } from "vitest";

import {
  anyQueryPending,
  anyQueryPlaceholder,
} from "@/domains/dossier/hooks/dossier-shell-query-helpers";

describe("anyQueryPending", () => {
  it("returns true before the first fetch settles", () => {
    expect(
      anyQueryPending([
        { isFetched: true, isError: false, isLoading: false },
        { isFetched: false, isError: false, isLoading: false },
      ])
    ).toBe(true);
  });

  it("returns false when settled queries refetch in the background", () => {
    expect(
      anyQueryPending([{ isFetched: true, isError: false, isLoading: false }])
    ).toBe(false);
  });
});

describe("anyQueryPlaceholder", () => {
  it("returns true when any query serves placeholder data", () => {
    expect(
      anyQueryPlaceholder([
        { isPlaceholderData: false },
        { isPlaceholderData: true },
      ])
    ).toBe(true);
  });

  it("returns false when no query serves placeholder data", () => {
    expect(
      anyQueryPlaceholder([
        { isPlaceholderData: false },
        { isPlaceholderData: false },
      ])
    ).toBe(false);
  });
});
