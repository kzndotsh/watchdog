import { describe, expect, it } from "vitest";

import {
  combinedQueryLoadError,
  queryLoadError,
} from "@/shared/lib/query-load-error";

describe("queryLoadError", () => {
  it("returns null while pending", () => {
    expect(
      queryLoadError(
        { isError: true, isFetching: false, error: new Error("down") },
        true,
        "Failed"
      )
    ).toBeNull();
  });

  it("returns null while refetching after a failure", () => {
    expect(
      queryLoadError(
        { isError: true, isFetching: true, error: new Error("down") },
        false,
        "Failed"
      )
    ).toBeNull();
  });

  it("surfaces the error message when settled and failed", () => {
    expect(
      queryLoadError(
        { isError: true, isFetching: false, error: new Error("down") },
        false,
        "Failed"
      )
    ).toBe("down");
  });
});

describe("combinedQueryLoadError", () => {
  it("returns null while any query is refetching", () => {
    expect(
      combinedQueryLoadError(
        [
          { isError: true, isFetching: true, error: new Error("a") },
          { isError: false, isFetching: false, error: null },
        ],
        false,
        "Failed"
      )
    ).toBeNull();
  });

  it("surfaces the first failed query error", () => {
    expect(
      combinedQueryLoadError(
        [
          { isError: false, isFetching: false, error: null },
          { isError: true, isFetching: false, error: new Error("b") },
        ],
        false,
        "Failed"
      )
    ).toBe("b");
  });
});
