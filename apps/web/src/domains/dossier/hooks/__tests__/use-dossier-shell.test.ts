import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { EntityRecord } from "@/domains/entities/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/entities/entities.functions", () => ({
  updateEntityFieldsFn: vi.fn(),
}));

vi.mock("@/shared/ui/shadcn/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/hooks/use-live-events", () => ({
  useLiveEvents: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
  invalidateAfterTaskMutation: vi.fn().mockResolvedValue(undefined),
}));

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

import { useDossierShell } from "@/domains/dossier/hooks/use-dossier-shell";

const ENTITY: EntityRecord = {
  id: testId(20),
  caseId: testId(10),
  slug: "alpha",
  name: "Alpha Entity",
  kind: "person",
  summary: null,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderShell() {
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
        case "identifiers": {
          return {
            data: [{ id: "id-1" }, { id: "id-2" }],
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
          return {
            data: [{ status: "todo" }, { status: "done" }],
            isFetched: true,
            isError: false,
            isLoading: false,
            isPlaceholderData: false,
          };
        }
        case "evidence": {
          const scope = options.queryKey[3];
          if (scope === "hidden") {
            return {
              data: [{ id: "hidden-evidence", entityId: null }],
              isFetched: true,
              isError: false,
              isLoading: false,
              isPlaceholderData: false,
            };
          }
          return {
            data: [
              { id: "evidence-1", entityId: ENTITY.id },
              { id: "evidence-2", entityId: testId(99) },
            ],
            isFetched: true,
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
  it("derives tab counts and opens evidence preview from the map", () => {
    const { result } = renderShell();

    expect(result.current.counts).toEqual({
      claims: 1,
      identifiers: 2,
      connections: 1,
      events: 3,
      questions: 1,
      evidence: 1,
      tasks: 1,
    });

    act(() => {
      result.current.handleEvidenceClick("evidence-1");
    });
    expect(result.current.previewEvidence?.id).toBe("evidence-1");
    act(() => {
      result.current.handleEvidenceClick("hidden-evidence");
    });
    expect(result.current.previewEvidence?.id).toBe("hidden-evidence");
    expect(result.current.evidenceAll).toHaveLength(3);
    expect(result.current.evidencePending).toBe(false);
    expect(result.current.countsPlaceholder).toBe(false);
    expect(result.current.editOpen).toBe(false);
    expect(useQueryMock).toHaveBeenCalled();
  });

  it("surfaces evidence load errors after queries settle", () => {
    useQueryMock.mockImplementation(
      (options: { queryKey: readonly unknown[] }) => {
        if (options.queryKey[0] === "evidence") {
          const scope = options.queryKey[3];
          if (scope === "hidden") {
            return {
              data: undefined,
              isFetched: true,
              isError: false,
              isLoading: false,
              isPending: false,
              isPlaceholderData: false,
            };
          }
          return {
            data: undefined,
            isFetched: true,
            isError: true,
            error: new Error("network down"),
            isLoading: false,
            isPending: false,
            isPlaceholderData: false,
          };
        }
        return {
          data: [],
          isFetched: true,
          isError: false,
          isLoading: false,
          isPending: false,
          isPlaceholderData: false,
        };
      }
    );

    const client = new QueryClient();
    const { result } = renderHook(() => useDossierShell(testId(10), ENTITY), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    });

    expect(result.current.evidenceLoadError).toBe("network down");
    expect(result.current.evidencePending).toBe(false);
  });
});
