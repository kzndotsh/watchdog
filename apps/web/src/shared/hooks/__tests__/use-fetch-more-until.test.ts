import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useFetchMoreUntil,
  type PagedQuery,
} from "@/shared/hooks/use-fetch-more-until";

function pagedQuery(overrides: Partial<PagedQuery> = {}): PagedQuery {
  return {
    fetchNextPage: vi.fn(),
    hasNextPage: true,
    isError: false,
    isFetchingNextPage: false,
    ...overrides,
  };
}

describe("useFetchMoreUntil", () => {
  it("asks for the next page while the view is not satisfied and a page remains", () => {
    const query = pagedQuery();
    renderHook(() => {
      useFetchMoreUntil(query, false);
    });
    expect(query.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("asks again when the page that was on its way has landed and the view is still empty", () => {
    const query = pagedQuery({ isFetchingNextPage: true });
    const { rerender } = renderHook(
      ({ current }: { current: PagedQuery }) => {
        useFetchMoreUntil(current, false);
      },
      { initialProps: { current: query } }
    );
    expect(query.fetchNextPage).not.toHaveBeenCalled();
    rerender({ current: { ...query, isFetchingNextPage: false } });
    expect(query.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("stops once the view is satisfied", () => {
    const query = pagedQuery();
    renderHook(() => {
      useFetchMoreUntil(query, true);
    });
    expect(query.fetchNextPage).not.toHaveBeenCalled();
  });

  it("stops at the last page", () => {
    const query = pagedQuery({ hasNextPage: false });
    renderHook(() => {
      useFetchMoreUntil(query, false);
    });
    expect(query.fetchNextPage).not.toHaveBeenCalled();
  });

  it("stops after an error rather than retrying forever", () => {
    const query = pagedQuery({ isError: true });
    renderHook(() => {
      useFetchMoreUntil(query, false);
    });
    expect(query.fetchNextPage).not.toHaveBeenCalled();
  });

  it("does not ask while a page is on its way", () => {
    const query = pagedQuery({ isFetchingNextPage: true });
    renderHook(() => {
      useFetchMoreUntil(query, false);
    });
    expect(query.fetchNextPage).not.toHaveBeenCalled();
  });
});
