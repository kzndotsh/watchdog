import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { entitiesListQuery } from "@/domains/entities/queries";
import { dueDateToIso } from "@/domains/tasks/lib/due-date";
import type { TaskFormValues } from "@/domains/tasks/lib/task-form";
import { tasksKeys, tasksListQuery } from "@/domains/tasks/queries";
import {
  createTaskFn,
  deleteTaskFn,
  reorderTasksFn,
  updateTaskFn,
} from "@/domains/tasks/tasks.functions";
import type { TaskEntityLabel, TaskRecord } from "@/domains/tasks/types";
import { errMessage } from "@/lib/utils";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { listPending } from "@/shared/lib/list-pending";
import { invalidateAfterTaskMutation } from "@/shared/lib/query-invalidation";
import type { TaskStatus } from "@watchdog/schemas";

export interface UseTaskWorkspaceOptions {
  entityId?: string;
  /** When false, skip SSE invalidation (parent already listens). Default true. */
  live?: boolean;
}

export function useTaskWorkspace(
  caseId: string,
  options: UseTaskWorkspaceOptions = {}
) {
  const { entityId, live = true } = options;
  const qc = useQueryClient();
  const filters = useMemo(
    () => (entityId ? { entityId } : undefined),
    [entityId]
  );

  const tasksQuery = useQuery(tasksListQuery(caseId, filters));
  const entitiesQuery = useQuery(entitiesListQuery(caseId));
  const pending = listPending(tasksQuery) || listPending(entitiesQuery);
  const tasks = tasksQuery.data ?? [];
  const entities = entitiesQuery.data ?? [];
  const tasksPlaceholder = tasksQuery.isPlaceholderData;

  const entityById = useMemo(() => {
    const map = new Map<string, TaskEntityLabel>();
    const rows = entitiesQuery.data ?? [];
    for (const e of rows) {
      map.set(e.id, { id: e.id, name: e.name, kind: e.kind });
    }
    return map;
  }, [entitiesQuery.data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>("backlog");
  const [selected, setSelected] = useState<TaskRecord | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useLiveEvents(live ? caseId : null, (event) => {
    if (event.type === "task_changed") {
      void invalidateAfterTaskMutation(qc, caseId);
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
        data: {
          caseId,
          title: values.title,
          description: values.description || undefined,
          status: values.status,
          priority: values.priority === "" ? null : values.priority,
          dueDate: dueDateToIso(values.dueDate),
          entityId: values.entityId === "" ? null : values.entityId,
        },
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setFormError(null);
      toast.success("Task created");
      await invalidateAfterTaskMutation(qc, caseId);
    },
    onError: (e) => {
      setFormError(errMessage(e, "Create failed"));
    },
  });

  const quickCreateMut = useMutation({
    mutationFn: async (vars: { status: TaskStatus; title: string }) =>
      createTaskFn({
        data: {
          caseId,
          title: vars.title,
          status: vars.status,
          entityId: entityId ?? null,
        },
      }),
    onSuccess: async () => {
      toast.success("Task created");
      await invalidateAfterTaskMutation(qc, caseId);
    },
    onError: (e) => {
      toast.error(errMessage(e, "Create failed"));
    },
  });

  const updateMut = useMutation({
    mutationFn: async (values: TaskFormValues) => {
      if (!selected) throw new Error("No task");
      return updateTaskFn({
        data: {
          caseId,
          taskId: selected.id,
          title: values.title,
          description: values.description || null,
          status: values.status,
          priority: values.priority === "" ? null : values.priority,
          dueDate: dueDateToIso(values.dueDate),
          entityId: values.entityId === "" ? null : values.entityId,
        },
      });
    },
    onSuccess: async () => {
      setSelected(null);
      setFormError(null);
      toast.success("Task updated");
      await invalidateAfterTaskMutation(qc, caseId);
    },
    onError: (e) => {
      setFormError(errMessage(e, "Update failed"));
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (taskId: string) =>
      deleteTaskFn({ data: { caseId, taskId } }),
    onSuccess: async (_data, taskId) => {
      if (selected?.id === taskId) {
        setSelected(null);
      }
      setFormError(null);
      toast.success("Task deleted");
      await invalidateAfterTaskMutation(qc, caseId);
    },
    onError: (e) => {
      const message = errMessage(e, "Delete failed");
      setFormError(message);
      toast.error(message);
    },
  });

  const statusMut = useMutation({
    mutationFn: async (vars: { task: TaskRecord; status: TaskStatus }) =>
      updateTaskFn({
        data: {
          caseId,
          taskId: vars.task.id,
          status: vars.status,
        },
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
        data: {
          caseId,
          status: vars.status,
          orderedIds: vars.orderedIds,
        },
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
    await reorderMut.mutateAsync({ status, orderedIds });
  }

  return {
    tasks,
    entities,
    pending,
    tasksPlaceholder,
    entityById,
    entityId,
    selected,
    formError,
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
