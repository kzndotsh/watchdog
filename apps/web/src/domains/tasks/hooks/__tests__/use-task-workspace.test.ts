import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildTaskListItem } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/tasks/tasks.functions", () => ({
  listTasksPageFn: vi.fn(),
  getTaskBoardFn: vi.fn(),
  getTaskFn: vi.fn(),
  createTaskFn: vi.fn(),
  updateTaskFn: vi.fn(),
  deleteTaskFn: vi.fn(),
  reorderTasksFn: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
  invalidateAfterTaskMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useTaskWorkspace } from "@/domains/tasks/hooks/use-task-workspace";
import { defaultsFromTask } from "@/domains/tasks/lib/task-form";
import { taskListView } from "@/domains/tasks/queries";
import {
  createTaskFn,
  getTaskBoardFn,
  listTasksPageFn,
  reorderTasksFn,
  updateTaskFn,
} from "@/domains/tasks/tasks.functions";
import { useList } from "@/shared/hooks/list/use-list";
import { memoryTasks } from "@/testing/memory-tasks";

const CASE_ID = testCaseId(10);
const ENTITY_ID = testId(30);
const ENTITY = {
  id: ENTITY_ID,
  name: "Target Alpha",
  slug: "target-alpha",
  kind: "person" as const,
};

const OPEN = buildTaskListItem({ id: testId(20), entity: ENTITY });
const OTHER_OPEN = buildTaskListItem({
  id: testId(21),
  title: "Other",
  position: 1,
});
const DONE = buildTaskListItem({
  id: testId(22),
  title: "Finished",
  status: "done",
  entity: ENTITY,
});
const DROPPED = buildTaskListItem({
  id: testId(23),
  title: "Abandoned",
  status: "dropped",
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

/** The Case board's wiring: both finished columns read the same (here empty) URL view. */
function useCaseBoard(entityId?: string) {
  const scope = { caseId: CASE_ID };
  const search = entityId === undefined ? {} : { entityId };
  const onSearchChange = vi.fn();
  const done = useList(taskListView, {
    scope,
    fixed: { status: ["done"] },
    search,
    onSearchChange,
  });
  const dropped = useList(taskListView, {
    scope,
    fixed: { status: ["dropped"] },
    search,
    onSearchChange,
  });
  return useTaskWorkspace(CASE_ID, { done, dropped });
}

async function renderBoard(entityId?: string) {
  const rendered = renderHook(() => useCaseBoard(entityId), { wrapper });
  await waitFor(() => {
    expect(rendered.result.current.pending).toBe(false);
  });
  return rendered;
}

beforeEach(() => {
  const server = memoryTasks([OPEN, OTHER_OPEN, DONE, DROPPED]);
  vi.mocked(getTaskBoardFn).mockImplementation(server.board);
  vi.mocked(listTasksPageFn).mockImplementation(server.listPage);
});

describe("useTaskWorkspace", () => {
  it("shows the board's open cards, then Done and Dropped, each once", async () => {
    const { result } = await renderBoard();

    await waitFor(() => {
      expect(result.current.tasks.map((task) => task.id)).toEqual([
        OPEN.id,
        OTHER_OPEN.id,
        DONE.id,
        DROPPED.id,
      ]);
    });
    expect(result.current.openCount).toBe(2);
    expect(result.current.isTruncated).toBe(false);
    expect(getTaskBoardFn).toHaveBeenCalledWith({ data: { caseId: CASE_ID } });
    expect(listTasksPageFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, status: ["done"] },
    });
    expect(listTasksPageFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, status: ["dropped"] },
    });
  });

  it("reads the board for the view's Entity, never the Case's whole Task list", async () => {
    const { result } = await renderBoard(ENTITY_ID);

    await waitFor(() => {
      expect(result.current.tasks.map((task) => task.id)).toEqual([
        OPEN.id,
        DONE.id,
      ]);
    });
    expect(getTaskBoardFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, entityId: ENTITY_ID },
    });
    expect(getTaskBoardFn).not.toHaveBeenCalledWith({
      data: { caseId: CASE_ID },
    });
  });

  it("opens the create dialog and tracks the selected task", async () => {
    const { result } = await renderBoard();

    act(() => {
      result.current.openCreate("in_progress");
    });
    expect(result.current.isCreateOpen).toBe(true);
    expect(result.current.createStatus).toBe("in_progress");

    act(() => {
      result.current.handleSelect(OPEN);
    });
    expect(result.current.selected).toEqual(OPEN);

    act(() => {
      result.current.closeSelected();
    });
    expect(result.current.selected).toBeNull();
  });

  it("quick-creates on the view's Entity", async () => {
    vi.mocked(createTaskFn).mockResolvedValue(OPEN);
    const { result } = await renderBoard(ENTITY_ID);

    await act(async () => {
      await result.current.handleQuickCreate("backlog", "New task");
    });

    expect(createTaskFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: CASE_ID,
        title: "New task",
        status: "backlog",
        entityId: ENTITY_ID,
      }),
    });
  });

  it("commits a drop on an open column as the move, then the order of the cards shown", async () => {
    vi.mocked(updateTaskFn).mockResolvedValue({ ...OPEN, status: "blocked" });
    vi.mocked(reorderTasksFn).mockResolvedValue([OPEN]);
    const { result } = await renderBoard(ENTITY_ID);

    await act(async () => {
      await result.current.handleCommitDrop(OPEN, "blocked", [OPEN.id]);
    });

    expect(updateTaskFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, taskId: OPEN.id, status: "blocked" },
    });
    // Only the cards the filtered board shows: the server keeps the others' slots.
    expect(reorderTasksFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, status: "blocked", orderedIds: [OPEN.id] },
    });
  });

  it("commits a drop on Done as the move only: Done follows its sort", async () => {
    vi.mocked(updateTaskFn).mockResolvedValue({ ...OPEN, status: "done" });
    const { result } = await renderBoard();

    await act(async () => {
      await result.current.handleCommitDrop(OPEN, "done", [OPEN.id, DONE.id]);
    });

    expect(updateTaskFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, taskId: OPEN.id, status: "done" },
    });
    expect(reorderTasksFn).not.toHaveBeenCalled();
  });

  it("surfaces the board's load error", async () => {
    vi.mocked(getTaskBoardFn).mockRejectedValue(new Error("tasks unavailable"));
    const { result } = renderHook(() => useCaseBoard(), { wrapper });

    await waitFor(() => {
      expect(result.current.boardLoadError).toBe("tasks unavailable");
    });
    expect(result.current.pending).toBe(false);
  });

  it("clears the description when an update sends only whitespace", async () => {
    vi.mocked(updateTaskFn).mockResolvedValue({ ...OPEN, description: null });
    const { result } = await renderBoard();

    act(() => {
      result.current.handleSelect(OPEN);
    });
    await act(async () => {
      await result.current.handleUpdate({
        ...defaultsFromTask(OPEN),
        description: "   ",
      });
    });

    expect(updateTaskFn).toHaveBeenCalledWith({
      data: {
        caseId: CASE_ID,
        taskId: OPEN.id,
        title: OPEN.title,
        description: null,
        status: OPEN.status,
        priority: null,
        dueDate: null,
        entityId: ENTITY_ID,
      },
    });
  });
});
