import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { EntityRecord } from "@/domains/entities/types";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/entities/entities.functions", () => ({
  updateEntityFieldsFn: vi.fn(),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
  invalidateAfterTaskMutation: vi.fn().mockResolvedValue(undefined),
}));

const useQueryMock = vi.hoisted(() => vi.fn());
const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useInfiniteQuery: (...args: unknown[]) => useInfiniteQueryMock(...args),
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

import { useDossierShell } from "@/domains/dossier/hooks/use-dossier-shell";

const ENTITY: EntityRecord = {
  version: 1,
  id: testId(20),
  caseId: testCaseId(10),
  slug: "alpha",
  name: "Alpha Entity",
  kind: "person",
  summary: null,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function isEvidenceQuery(
  options: unknown
): options is { queryKey: readonly unknown[]; enabled?: boolean } {
  return (
    typeof options === "object" &&
    options !== null &&
    "queryKey" in options &&
    Array.isArray(options.queryKey) &&
    options.queryKey[0] === "evidence"
  );
}

/** One settled first page of a list view, with its total. */
function listPage(count: number) {
  return {
    data: {
      pages: [
        {
          items: [{ id: "row-1" }],
          nextCursor: null,
          total: { count, isCapped: false },
        },
      ],
      pageParams: [undefined],
    },
    isFetched: true,
    isError: false,
    isLoading: false,
    isPlaceholderData: false,
    hasNextPage: false,
  };
}

function renderShell() {
  useQueryMock.mockClear();
  useInfiniteQueryMock.mockImplementation(
    (options: { queryKey: readonly unknown[] }) =>
      listPage(options.queryKey[0] === "identifiers" ? 2 : 5)
  );
  useQueryMock.mockImplementation(
    (options: { queryKey: readonly unknown[] }) => {
      switch (options.queryKey[0]) {
        case "claims": {
          return {
            data: [{ retracted: false }, { retracted: true }],
            isFetched: true,
            isError: false,
            isLoading: false,
            isPlaceholderData: false,
          };
        }
        case "edges": {
          return {
            data: [{ id: "edge-1" }],
            isFetched: true,
            isError: false,
            isLoading: false,
            isPlaceholderData: false,
          };
        }
        case "events": {
          return {
            data: [{ id: "ev-1" }, { id: "ev-2" }, { id: "ev-3" }],
            isFetched: true,
            isError: false,
            isLoading: false,
            isPlaceholderData: false,
          };
        }
        case "questions": {
          return {
            data: [{ status: "open" }, { status: "resolved" }],
            isFetched: true,
            isError: false,
            isLoading: false,
            isPlaceholderData: false,
          };
        }
        case "tasks": {
          // The Entity's board (`tasks.board`): its open cards only.
          return {
            data: { items: [{ status: "backlog" }], isTruncated: false },
            isFetched: true,
            isError: false,
            isLoading: false,
            isPlaceholderData: false,
          };
        }
        case "evidence": {
          // Only the preview's one item by id (`evidenceByIdQuery`), and only once asked for.
          const isAsked =
            options.queryKey[2] === "by-id" &&
            (options as { enabled?: boolean }).enabled !== false;
          return {
            data: isAsked
              ? { id: options.queryKey[3], entityId: ENTITY.id }
              : undefined,
            isFetched: isAsked,
            isError: false,
            isLoading: false,
            isPlaceholderData: false,
          };
        }
        default: {
          return {
            data: [],
            isFetched: true,
            isError: false,
            isLoading: false,
            isPlaceholderData: false,
          };
        }
      }
    }
  );

  const client = new QueryClient();
  return renderHook(() => useDossierShell(testId(10), ENTITY), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

describe("useDossierShell", () => {
  it("derives tab counts and opens the evidence preview by id", () => {
    const { result } = renderShell();

    expect(result.current.counts).toEqual({
      claims: 1,
      connections: 1,
      events: 3,
      questions: 1,
      tasks: 1,
    });
    // Identifiers and Evidence count from their list's first-page total, not a whole read.
    expect(result.current.identifierCount.total).toEqual({
      count: 2,
      isCapped: false,
    });
    expect(result.current.evidenceCount.total).toEqual({
      count: 5,
      isCapped: false,
    });

    act(() => {
      result.current.handleEvidenceClick(testId(77));
    });
    expect(result.current.previewEvidence?.id).toBe(testId(77));
    act(() => {
      result.current.closeEvidencePreview();
    });
    expect(result.current.previewEvidence).toBeNull();
    expect(result.current.countsPlaceholder).toBe(false);
    expect(result.current.isEditOpen).toBe(false);
    expect(useQueryMock).toHaveBeenCalled();
  });

  it("reads no Case-wide Evidence: only the preview's item, once a chip is clicked", () => {
    renderShell();
    const evidenceCalls = useQueryMock.mock.calls
      .map((call: unknown[]) => call[0])
      .filter(isEvidenceQuery);
    expect(evidenceCalls.length).toBeGreaterThan(0);
    expect(
      evidenceCalls.every(
        (options) =>
          options.queryKey[2] === "by-id" && options.enabled === false
      )
    ).toBe(true);
  });
});
