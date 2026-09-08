import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
  };
});

import { useCollectQueueData } from "@/domains/collect/hooks/use-collect-queue-data";

function loadedQuery(data: unknown = []) {
  return {
    data,
    isFetched: true,
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
    isFetching: false,
    error: null,
  };
}

function pendingQuery() {
  return {
    data: undefined,
    isFetched: false,
    isLoading: true,
    isError: false,
    isPlaceholderData: false,
    isFetching: true,
    error: null,
  };
}

function erroredQuery(error: Error) {
  return {
    data: undefined,
    isFetched: true,
    isLoading: false,
    isError: true,
    isPlaceholderData: false,
    isFetching: false,
    error,
  };
}

describe("useCollectQueueData", () => {
  it("defers queueLoadError while sibling queue queries are still pending", () => {
    useQueryMock.mockImplementation(
      (options: { queryKey?: readonly unknown[] }) => {
        const key = options.queryKey ?? [];
        if (key[0] === "evidence" && key[3] === "active") {
          return erroredQuery(new Error("Evidence unavailable"));
        }
        if (key[0] === "jobs") {
          return pendingQuery();
        }
        if (key[0] === "entities") {
          return loadedQuery([]);
        }
        if (key[0] === "evidence" && key[3] === "hidden") {
          return loadedQuery([]);
        }
        if (key[0] === "credentials") {
          return loadedQuery([]);
        }
        return loadedQuery([]);
      }
    );

    const { result } = renderHook(() => useCollectQueueData(testId(10)));

    expect(result.current.queuePending).toBe(true);
    expect(result.current.queueLoadError).toBeNull();
  });
});
