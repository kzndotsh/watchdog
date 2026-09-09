import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { entityOptionsFromRecords } from "@/domains/entities/lib/entity-options";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { mergeEntityScopedColumnOrder } from "@/domains/tasks/lib/task-board-dnd";
import type { TaskFormValues } from "@/domains/tasks/lib/task-form";
import { EMPTY_TASK_FORM } from "@/domains/tasks/lib/task-form";
import {
  buildCreateTaskData,
  buildTaskStatusUpdateData,
  buildUpdateTaskData,
} from "@/domains/tasks/lib/task-write";
import { tasksKeys, tasksListQuery } from "@/domains/tasks/queries";
import {
  createTaskFn,
  deleteTaskFn,
  reorderTasksFn,
  updateTaskFn,
} from "@/domains/tasks/tasks.functions";
import type { TaskEntityLabel, TaskRecord } from "@/domains/tasks/types";
import {
  deleteTaskInputSchema,
  reorderTasksInputSchema,
} from "@/domains/tasks/types";
import { errMessage } from "@/lib/utils";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { listPending } from "@/shared/lib/list-pending";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import {
  invalidateAfterEntityChanged,
  invalidateAfterTaskMutation,
} from "@/shared/lib/query-invalidation";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";
import {
  TOAST_TASK_CREATED,
  TOAST_TASK_DELETED,
  TOAST_TASK_UPDATED,
} from "@/shared/lib/toast-copy";
import { ensureAppQueryData } from "@/shared/lib/warm-query";
import { toast } from "@/shared/ui/shadcn/toast";
import type { TaskStatus } from "@watchdog/schemas";

const EMPTY_TASKS: TaskRecord[] = [];
const EMPTY_ENTITIES: EntityRecord[] = [];

export interface UseTaskWorkspaceOptions {
  entityId?: string;
  /** When false, skip SSE invalidation (parent already listens). Default true. */
  live?: boolean;
}

export function useTaskWorkspace(
  caseId: string,
  options: UseTaskWorkspaceOptions = {}
) {
  const { entityId: rawEntityId, live = true } = options;
  const scopedEntityId = scopeOptionalUuid(rawEntityId);
  const qc = useQueryClient();
  const filters = useMemo(
    () => (scopedEntityId ? { entityId: scopedEntityId } : undefined),
    [scopedEntityId]
  );

  const tasksQuery = useQuery(tasksListQuery(caseId, filters));
  const entitiesQuery = useQuery(entitiesListQuery(caseId));
  const pending = listPending(tasksQuery) || listPending(entitiesQuery);
  const tasksLoadError = combinedQueryLoadError(
    [tasksQuery, entitiesQuery],
    pending,
    "Failed to load tasks"
  );
  const tasks = tasksQuery.data ?? EMPTY_TASKS;
  const entityOptions = useMemo(
    () => entityOptionsFromRecords(entitiesQuery.data ?? EMPTY_ENTITIES),
    [entitiesQuery.data]
  );
  const tasksPlaceholder =
    tasksQuery.isPlaceholderData || entitiesQuery.isPlaceholderData;

  const entityById = useMemo(() => {
    const map = new Map<string, TaskEntityLabel>();
    const rows = entitiesQuery.data ?? EMPTY_ENTITIES;
    for (const e of rows) {
      map.set(e.id, { id: e.id, name: e.name, slug: e.slug, kind: e.kind });
    }
    return map;
  }, [entitiesQuery.data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>("backlog");
  const [selected, setSelected] = useState<TaskRecord | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);

  useLiveEvents(live ? caseId : null, (event) => {
    if (event.type === "task_changed") {
      void invalidateAfterTaskMutation(qc, caseId);
    }
    if (event.type === "entity_changed") {
      void invalidateAfterEntityChanged(qc, caseId);
    }
  });

  function openCreate(status: TaskStatus = "backlog") {
    setFormError(null);
    setCreateStatus(status);
    setCreateOpen(true);
  }

  function selectTask(task: TaskRecord) {
    setFormError(null);
    setSelected(task);
  }

  function closeSelected() {
    setSelected(null);
    setFormError(null);
  }

  const createMut = useMutation({
    mutationFn: async (values: TaskFormValues) =>
      createTaskFn({
        data: buildCreateTaskData(caseId, values),
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setFormError(null);
      toast.success(TOAST_TASK_CREATED);
      await invalidateAfterTaskMutation(qc, caseId);
    },
    onError: (e) => {
      setFormError(errMessage(e, "Create failed"));
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
      setQuickCreateError(errMessage(e, "Create failed"));
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
      setSelected(null);
      setFormError(null);
      toast.success(TOAST_TASK_UPDATED);
      await invalidateAfterTaskMutation(qc, caseId);
    },
    onError: (e) => {
      setFormError(errMessage(e, "Update failed"));
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (taskId: string) =>
      deleteTaskFn({
        data: deleteTaskInputSchema.parse({ caseId, taskId }),
      }),
    onSuccess: async (_data, taskId) => {
      if (selected?.id === taskId) {
        setSelected(null);
      }
      setFormError(null);
      toast.success(TOAST_TASK_DELETED);
      await invalidateAfterTaskMutation(qc, caseId);
    },
    onError: (e) => {
      toast.error(errMessage(e, "Delete failed"));
    },
  });

  const statusMut = useMutation({
    mutationFn: async (vars: { task: TaskRecord; status: TaskStatus }) =>
      updateTaskFn({
        data: buildTaskStatusUpdateData(caseId, vars.task.id, vars.status),
      }),
    onMutate: async ({ task, status }) => {
      await qc.cancelQueries({ queryKey: tasksKeys.all(caseId) });
      const previous = qc.getQueriesData<TaskRecord[]>({
        queryKey: tasksKeys.all(caseId),
      });
      qc.setQueriesData<TaskRecord[]>(
        { queryKey: tasksKeys.all(caseId) },
        (old) => {
          if (!old) return old;
          return old.map((row) =>
            row.id === task.id ? { ...row, status } : row
          );
        }
      );
      if (selected?.id === task.id) {
        setSelected({ ...task, status });
      }
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) {
        for (const [key, data] of ctx.previous) {
          qc.setQueryData(key, data);
        }
      }
      toast.error(errMessage(e, "Move failed"));
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
      toast.error(errMessage(e, "Reorder failed"));
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
    let reorderIds = orderedIds;
    if (scopedEntityId !== undefined) {
      const allTasks = await ensureAppQueryData(qc, tasksListQuery(caseId));
      reorderIds = mergeEntityScopedColumnOrder(
        allTasks,
        status,
        scopedEntityId,
        orderedIds
      );
    }
    await reorderMut.mutateAsync({ status, orderedIds: reorderIds });
  }

  return {
    tasks,
    entities: entityOptions,
    pending,
    tasksLoadError,
    handleRetryBoard: () => {
      if (tasksQuery.isError) void tasksQuery.refetch();
      if (entitiesQuery.isError) void entitiesQuery.refetch();
    },
    tasksPlaceholder,
    entityById,
    entityId: scopedEntityId,
    selected,
    formError,
    quickCreateError,
    createOpen,
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
    handleCreateOpenChange: setCreateOpen,
  };
}
