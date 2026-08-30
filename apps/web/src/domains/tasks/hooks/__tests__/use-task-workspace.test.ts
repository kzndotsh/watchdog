import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { TaskRecord } from "@/domains/tasks/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/tasks/tasks.functions", () => ({
  createTaskFn: vi.fn(),
  updateTaskFn: vi.fn(),
  deleteTaskFn: vi.fn(),
  reorderTasksFn: vi.fn(),
}));

vi.mock("@/shared/hooks/use-live-events", () => ({
  useLiveEvents: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterTaskMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useMutation: (options: {
      mutationFn: (...args: unknown[]) => Promise<unknown>;
    }) => {
      useMutationMock(options);
      return {
        mutateAsync: async (...args: unknown[]) => options.mutationFn(...args),
        isPending: false,
      };
    },
  };
});

import { useTaskWorkspace } from "@/domains/tasks/hooks/use-task-workspace";
import {
  createTaskFn,
  reorderTasksFn,
  updateTaskFn,
} from "@/domains/tasks/tasks.functions";
import { useLiveEvents } from "@/shared/hooks/use-live-events";

const CASE_ID = testId(10);
const ENTITY_ID = testId(30);
const TASK_ID = testId(20);

const TASK: TaskRecord = {
  id: TASK_ID,
  caseId: CASE_ID,
  entityId: ENTITY_ID,
  title: "Follow up",
  description: null,
  status: "backlog",
  priority: null,
  dueDate: null,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

function mockQueries() {
  useQueryMock.mockImplementation(
    (options: { queryKey?: readonly unknown[] }) => {
      const key = options.queryKey?.[0];
      if (key === "tasks") {
        return {
          data: [TASK],
          isFetched: true,
          isLoading: false,
          isError: false,
        };
      }
      if (key === "entities") {
        return {
          data: [
            {
              id: ENTITY_ID,
              name: "Target Alpha",
              slug: "target-alpha",
              kind: "person",
            },
          ],
          isFetched: true,
          isLoading: false,
          isError: false,
        };
      }
      return { data: [], isFetched: true, isLoading: false, isError: false };
    }
  );
}

describe("useTaskWorkspace", () => {
  it("loads tasks and entity labels for the active case", () => {
    mockQueries();

    const { result } = renderHook(() => useTaskWorkspace(CASE_ID), { wrapper });

    expect(result.current.tasks).toEqual([TASK]);
    expect(result.current.entityById.get(ENTITY_ID)).toEqual({
      id: ENTITY_ID,
      name: "Target Alpha",
      kind: "person",
    });
  });

  it("opens create dialog and tracks selected tasks", () => {
    mockQueries();

    const { result } = renderHook(() => useTaskWorkspace(CASE_ID), { wrapper });

    act(() => {
      result.current.openCreate("in_progress");
    });
    expect(result.current.createOpen).toBe(true);
    expect(result.current.createStatus).toBe("in_progress");

    act(() => {
      result.current.handleSelect(TASK);
    });
    expect(result.current.selected).toEqual(TASK);

    act(() => {
      result.current.closeSelected();
    });
    expect(result.current.selected).toBeNull();
  });

  it("quick-creates tasks with the scoped entity id", async () => {
    mockQueries();
    vi.mocked(createTaskFn).mockResolvedValue(TASK);

    const { result } = renderHook(
      () => useTaskWorkspace(CASE_ID, { entityId: ENTITY_ID, live: false }),
      { wrapper }
    );

    await act(async () => {
      await result.current.handleQuickCreate("backlog", "New task");
    });

    expect(createTaskFn).toHaveBeenCalledWith({
      data: {
        caseId: CASE_ID,
        title: "New task",
        status: "backlog",
        entityId: ENTITY_ID,
      },
    });
    expect(useLiveEvents).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("commits drops by updating status then reordering", async () => {
    mockQueries();
    vi.mocked(updateTaskFn).mockResolvedValue({
      ...TASK,
      status: "in_progress",
    });
    vi.mocked(reorderTasksFn).mockResolvedValue([TASK]);

    const { result } = renderHook(() => useTaskWorkspace(CASE_ID), { wrapper });

    await act(async () => {
      await result.current.handleCommitDrop(TASK, "in_progress", [TASK_ID]);
    });

    expect(updateTaskFn).toHaveBeenCalledWith({
      data: {
        caseId: CASE_ID,
        taskId: TASK_ID,
        status: "in_progress",
      },
    });
    expect(reorderTasksFn).toHaveBeenCalledWith({
      data: {
        caseId: CASE_ID,
        status: "in_progress",
        orderedIds: [TASK_ID],
      },
    });
  });
});
