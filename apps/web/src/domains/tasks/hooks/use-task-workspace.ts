import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { useTaskDeepLink } from "@/domains/tasks/hooks/use-task-deep-link";
import { taskBoardCount } from "@/domains/tasks/lib/board-count";
import type { TaskFormValues } from "@/domains/tasks/lib/task-form";
import { EMPTY_TASK_FORM } from "@/domains/tasks/lib/task-form";
import {
  buildCreateTaskData,
  buildTaskStatusUpdateData,
  buildUpdateTaskData,
} from "@/domains/tasks/lib/task-write";
import {
  taskBoardQuery,
  taskBoardViewOf,
  taskListView,
  tasksKeys,
} from "@/domains/tasks/queries";
import {
  createTaskFn,
  deleteTaskFn,
  reorderTasksFn,
  updateTaskFn,
} from "@/domains/tasks/tasks.functions";
import type {
  TaskBoardRecord,
  TaskListItem,
  TaskRecord,
} from "@/domains/tasks/types";
import { couldnt, errMessage } from "@/lib/utils";
import { listPending } from "@/shared/lib/list-pending";
import type { ListHandle } from "@/shared/lib/list/list-types";
import type { ListPages } from "@/shared/lib/list/list-view";
import { invalidateAfterTaskMutation } from "@/shared/lib/query-invalidation";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";
import {
  TOAST_TASK_CREATED,
  TOAST_TASK_DELETED,
  TOAST_TASK_UPDATED,
} from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";
import {
  taskDeleteInputSchema as deleteTaskInputSchema,
  taskReorderInputSchema as reorderTasksInputSchema,
  type taskList,
} from "@watchdog/schemas/feed";
import {
  isOpenTaskStatus,
  type FilterKey,
  type TaskStatus,
} from "@watchdog/schemas/shared";

type TaskListDef = typeof taskList;

/**
 * The board's two finished columns, each the Task list with `status` fixed (`useList`, ADR-0007).
 * The screen builds them: the Case board's view comes from its URL, the Dossier's is its Entity.
 */
export type TaskClosedLists<K extends FilterKey<TaskListDef>> = {
  readonly done: ListHandle<TaskListDef, TaskListItem, K>;
  readonly dropped: ListHandle<TaskListDef, TaskListItem, K>;
};

const EMPTY_ITEMS: readonly TaskListItem[] = [];

function NO_LINK_CLEAR() {
  // Without a link there is nothing to clear.
}

/** One card per id: a card moved to Done shows once while the board and the list both refetch. */
function boardItems(
  open: readonly TaskListItem[],
  done: readonly TaskListItem[],
  dropped: readonly TaskListItem[]
): TaskListItem[] {
  const seen = new Set<string>();
  const items: TaskListItem[] = [];
  for (const item of [...open, ...done, ...dropped]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

type CachedTasks = [readonly unknown[], unknown][];

/** Move one card to `status` in every cached board and Task list page of the Case. */
function patchCachedStatus(
  qc: QueryClient,
  caseId: string,
  taskId: string,
  status: TaskStatus
): CachedTasks {
  const withStatus = (row: TaskListItem) =>
    row.id === taskId ? { ...row, status } : row;
  const previous: CachedTasks = [
    ...qc.getQueriesData({ queryKey: tasksKeys.boards(caseId) }),
    ...qc.getQueriesData({ queryKey: taskListView.prefix({ caseId }) }),
  ];
  qc.setQueriesData<TaskBoardRecord>(
    { queryKey: tasksKeys.boards(caseId) },
    (old) => (old ? { ...old, items: old.items.map(withStatus) } : old)
  );
  qc.setQueriesData<ListPages<TaskListItem>>(
    { queryKey: taskListView.prefix({ caseId }) },
    (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map(withStatus),
            })),
          }
        : old
  );
  return previous;
}

/**
 * The Tasks board's data and writes, for the Case board and the Dossier tab alike:
 *
 *   open columns   `tasks.board`: every open card of the view, capped (`isTruncated`)
 *   Done, Dropped  the Task list with `status` fixed: a page at a time, Load more
 *
 * Both read the same view (the closed lists' query: `entityId`, `priority`, `q`), so a filter
 * narrows every column. A drag inside an open column reorders the cards it shows
 * (`tasks.reorder` keeps the other cards' slots); a drop on Done or Dropped only moves the
 * status, since those columns follow their sort, not a position.
 */
/**
 * A card link (`?taskId=`, `useTaskDeepLink`): its card is the selection until the user picks
 * another card or closes the dialog, which drops the link (`onClear`).
 */
export type TaskLinkArgs = {
  readonly taskId: string | undefined;
  readonly onClear: () => void;
};

export function useTaskWorkspace<K extends FilterKey<TaskListDef>>(
  caseId: string,
  closed: TaskClosedLists<K>,
  link?: TaskLinkArgs
) {
  const qc = useQueryClient();
  const view = taskBoardViewOf(closed.done.query);
  const boardQuery = useQuery(taskBoardQuery(caseId, view));
  const pending = listPending(boardQuery);
  const boardLoadError = combinedQueryLoadError(
    [boardQuery],
    pending,
    "Failed to load tasks"
  );
  const board = boardQuery.data;
  const open = board?.items ?? EMPTY_ITEMS;
  const tasks = useMemo(
    () => boardItems(open, closed.done.rows, closed.dropped.rows),
    [open, closed.done.rows, closed.dropped.rows]
  );
  const scopedEntityId = view.entityId;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>("backlog");
  const linked = useTaskDeepLink({
    caseId,
    taskId: link?.taskId,
    isBoardReady: !pending && !boardQuery.isPlaceholderData,
    tasks,
    onClear: link?.onClear ?? NO_LINK_CLEAR,
  });
  const [picked, setPicked] = useState<TaskRecord | null>(null);
  // A picked card wins; otherwise the linked one is open.
  const selected = picked ?? linked.task;
  const [formError, setFormError] = useState<string | null>(null);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);

  const openCreate = useCallback((status: TaskStatus = "backlog") => {
    setFormError(null);
    setCreateStatus(status);
    setIsCreateOpen(true);
  }, []);

  const selectTask = useCallback((task: TaskRecord) => {
    setFormError(null);
    setPicked(task);
  }, []);

  /** Close the open card: forget the pick, and drop the link that opened it. */
  function clearSelection() {
    setPicked(null);
    if (linked.task !== null) link?.onClear();
  }

  function closeSelected() {
    clearSelection();
    setFormError(null);
  }

  const createMut = useMutation({
    mutationFn: async (values: TaskFormValues) =>
      createTaskFn({
        data: buildCreateTaskData(caseId, values),
      }),
    onSuccess: async () => {
      setIsCreateOpen(false);
      setFormError(null);
      toast.success(TOAST_TASK_CREATED);
      await invalidateAfterTaskMutation(qc, caseId);
    },
    onError: (e) => {
      setFormError(errMessage(e, couldnt("create", "task")));
    },
  });

  const quickCreateMut = useMutation({
    mutationFn: async (vars: { status: TaskStatus; title: string }) =>
      createTaskFn({
        data: buildCreateTaskData(
          caseId,
          {
            ...EMPTY_TASK_FORM,
            title: vars.title,
            status: vars.status,
          },
          { entityId: scopedEntityId ?? null }
        ),
      }),
    onSuccess: async () => {
      setQuickCreateError(null);
      toast.success(TOAST_TASK_CREATED);
      await invalidateAfterTaskMutation(qc, caseId);
    },
    onError: (e) => {
      setQuickCreateError(errMessage(e, couldnt("create", "task")));
    },
  });

  const updateMut = useMutation({
    mutationFn: async (values: TaskFormValues) => {
      if (!selected) throw new Error("No task");
      return updateTaskFn({
        data: buildUpdateTaskData(caseId, selected.id, values),
      });
    },
    onSuccess: async () => {
      clearSelection();
      setFormError(null);
      toast.success(TOAST_TASK_UPDATED);
      await invalidateAfterTaskMutation(qc, caseId);
    },
    onError: (e) => {
      setFormError(errMessage(e, couldnt("update", "task")));
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (taskId: string) =>
      deleteTaskFn({
        data: deleteTaskInputSchema.parse({ caseId, taskId }),
      }),
    onSuccess: async (_data, taskId) => {
      if (selected?.id === taskId) {
        clearSelection();
      }
      setFormError(null);
      toast.success(TOAST_TASK_DELETED);
      await invalidateAfterTaskMutation(qc, caseId);
    },
    onError: (e) => {
      toast.error(errMessage(e, couldnt("delete", "task")));
    },
  });

  const statusMut = useMutation({
    mutationFn: async (vars: { task: TaskRecord; status: TaskStatus }) =>
      updateTaskFn({
        data: buildTaskStatusUpdateData(caseId, vars.task.id, vars.status),
      }),
    onMutate: async ({ task, status }) => {
      await qc.cancelQueries({ queryKey: tasksKeys.all(caseId) });
      const previous = patchCachedStatus(qc, caseId, task.id, status);
      if (selected?.id === task.id) {
        setPicked({ ...task, status });
      }
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) {
        for (const [key, data] of ctx.previous) {
          qc.setQueryData(key, data);
        }
      }
      toast.error(errMessage(e, couldnt("move", "task")));
    },
    onSettled: async () => {
      await invalidateAfterTaskMutation(qc, caseId);
    },
  });

  const reorderMut = useMutation({
    mutationFn: async (vars: { status: TaskStatus; orderedIds: string[] }) =>
      reorderTasksFn({
        data: reorderTasksInputSchema.parse({
          caseId,
          status: vars.status,
          orderedIds: vars.orderedIds,
        }),
      }),
    onError: (e) => {
      toast.error(errMessage(e, couldnt("reorder", "tasks")));
    },
    onSettled: async () => {
      await invalidateAfterTaskMutation(qc, caseId);
    },
  });

  async function changeStatus(task: TaskRecord, status: TaskStatus) {
    if (task.status === status) return;
    await statusMut.mutateAsync({ task, status });
  }

  async function commitDrop(
    task: TaskRecord,
    status: TaskStatus,
    orderedIds: string[]
  ) {
    if (task.status !== status) {
      await statusMut.mutateAsync({ task, status });
    }
    // Done and Dropped follow their sort, so a drop there is only the move. An open column's
    // order is the cards it shows; the server keeps the slots of any it does not (#569).
    if (!isOpenTaskStatus(status) || orderedIds.length === 0) return;
    await reorderMut.mutateAsync({ status, orderedIds });
  }

  return {
    tasks,
    pending,
    boardLoadError,
    handleRetryBoard: () => {
      void boardQuery.refetch();
    },
    /** The open cards on the board, "500+" once it was cut (`ListCount` shape). */
    openCount: taskBoardCount(board),
    /** More open Tasks match than the board holds (`TASK_BOARD_MAX`). */
    isTruncated: board?.isTruncated ?? false,
    tasksPlaceholder: boardQuery.isPlaceholderData,
    /** The linked card's by-id read failed: the error state's copy, and its Retry. */
    linkError: linked.error,
    handleRetryLink: linked.retry,
    entityId: scopedEntityId,
    selected,
    formError,
    quickCreateError,
    isCreateOpen,
    createStatus,
    openCreate,
    handleSelect: selectTask,
    closeSelected,
    createBusy: createMut.isPending,
    updateBusy: updateMut.isPending || deleteMut.isPending,
    quickCreateBusy: quickCreateMut.isPending,
    handleCreate: async (values: TaskFormValues) => {
      await createMut.mutateAsync(values);
    },
    handleUpdate: async (values: TaskFormValues) => {
      await updateMut.mutateAsync(values);
    },
    handleDelete: async (task?: TaskRecord) => {
      const taskId = task?.id ?? selected?.id;
      if (!taskId) throw new Error("No task");
      await deleteMut.mutateAsync(taskId);
    },
    handleQuickCreate: async (status: TaskStatus, title: string) => {
      await quickCreateMut.mutateAsync({ status, title });
    },
    handleStatusChange: changeStatus,
    handleCommitDrop: commitDrop,
    handleCreateOpenChange: setIsCreateOpen,
  };
}
