import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (fn: unknown) => fn,
    }),
    handler: (fn: unknown) => fn,
  }),
}));

const tasksApi = {
  list: vi.fn(),
  board: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
};

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: () => ({ tasks: tasksApi }),
  orpcNullIfNotFound: (value: unknown) => value,
}));

import {
  createTaskFn,
  deleteTaskFn,
  getTaskBoardFn,
  getTaskFn,
  listTasksPageFn,
  reorderTasksFn,
} from "@/domains/tasks/tasks.functions";

type ServerDataContext<T> = {
  data: T;
  context: Record<string, never>;
};

const TASK = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  caseId: "660e8400-e29b-41d4-a716-446655440001",
  entityId: null,
  title: "Follow up",
  description: null,
  status: "backlog" as const,
  priority: null,
  dueDate: null,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("tasks.functions", () => {
  it("reads one page of the Task list, the board and one Task through oRPC", async () => {
    const page = {
      items: [{ ...TASK, entity: null }],
      nextCursor: null,
      total: { count: 1, isCapped: false },
    };
    tasksApi.list.mockResolvedValue(page);
    tasksApi.board.mockResolvedValue({ items: page.items, isTruncated: false });
    tasksApi.get.mockResolvedValue(TASK);
    const call = (fn: unknown, data: Record<string, unknown>) =>
      (fn as (input: ServerDataContext<typeof data>) => Promise<unknown>)({
        data,
        context: {},
      });

    await expect(
      call(listTasksPageFn, { caseId: TASK.caseId, status: ["done"] })
    ).resolves.toEqual(page);
    expect(tasksApi.list).toHaveBeenCalledWith({
      caseId: TASK.caseId,
      status: ["done"],
    });
    await expect(
      call(getTaskBoardFn, { caseId: TASK.caseId, q: "follow" })
    ).resolves.toEqual({ items: page.items, isTruncated: false });
    expect(tasksApi.board).toHaveBeenCalledWith({
      caseId: TASK.caseId,
      q: "follow",
    });
    await expect(
      call(getTaskFn, { caseId: TASK.caseId, taskId: TASK.id })
    ).resolves.toEqual(TASK);
  });

  it("creates, reorders, and deletes tasks through oRPC", async () => {
    tasksApi.create.mockResolvedValue(TASK);
    tasksApi.reorder.mockResolvedValue([TASK]);
    tasksApi.remove.mockResolvedValue({ ok: true });

    await expect(
      (
        createTaskFn as unknown as (
          input: ServerDataContext<{ caseId: string; title: string }>
        ) => Promise<unknown>
      )({
        data: { caseId: TASK.caseId, title: "Follow up" },
        context: {},
      })
    ).resolves.toEqual(TASK);

    await expect(
      (
        reorderTasksFn as unknown as (
          input: ServerDataContext<{
            caseId: string;
            status: typeof TASK.status;
            orderedIds: string[];
          }>
        ) => Promise<unknown>
      )({
        data: {
          caseId: TASK.caseId,
          status: "backlog",
          orderedIds: [TASK.id],
        },
        context: {},
      })
    ).resolves.toEqual([TASK]);

    await expect(
      (
        deleteTaskFn as unknown as (
          input: ServerDataContext<{ caseId: string; taskId: string }>
        ) => Promise<{ ok: true }>
      )({
        data: { caseId: TASK.caseId, taskId: TASK.id },
        context: {},
      })
    ).resolves.toEqual({ ok: true });
  });
});
