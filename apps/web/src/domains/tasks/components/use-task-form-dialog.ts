import { useForm } from "@tanstack/react-form";
import { useEffect, type SubmitEvent } from "react";

import type { TaskDialogForm } from "@/domains/tasks/components/task-form-dialog-form";
import {
  EMPTY_TASK_FORM,
  defaultsFromTask,
  normalizeTaskForm,
  taskFormIssues,
  type TaskFormValues,
} from "@/domains/tasks/lib/task-form";
import type { TaskRecord } from "@/domains/tasks/types";
import type { TaskStatus } from "@watchdog/schemas/shared";

interface TaskFormDialogCoreProps {
  open: boolean;
  mode: "create" | "edit";
  task: TaskRecord | null;
  defaultStatus: TaskStatus;
  defaultEntityId: string | null | undefined;
  onSubmit: (values: TaskFormValues) => void | Promise<void>;
}

function createDefaults(
  defaultStatus: TaskStatus,
  defaultEntityId: string | null | undefined
): TaskFormValues {
  return {
    ...EMPTY_TASK_FORM,
    status: defaultStatus,
    entityId: defaultEntityId ?? "",
  };
}

function resetTaskFormValues(
  form: TaskDialogForm,
  props: TaskFormDialogCoreProps
): void {
  if (props.mode === "edit") {
    if (!props.task) return;
    form.reset(defaultsFromTask(props.task));
    return;
  }
  form.reset(createDefaults(props.defaultStatus, props.defaultEntityId));
}

async function submitTaskFormValues(
  value: TaskFormValues,
  onSubmit: (values: TaskFormValues) => void | Promise<void>
): Promise<void> {
  if (taskFormIssues(value).length > 0) return;
  await onSubmit(normalizeTaskForm(value));
}

function createTaskFormSubmitHandler(
  onSubmit: (values: TaskFormValues) => void | Promise<void>
) {
  return async ({ value }: { value: TaskFormValues }) =>
    submitTaskFormValues(value, onSubmit);
}

function preventTaskFormDefault(
  form: TaskDialogForm,
  event: SubmitEvent
): void {
  event.preventDefault();
  event.stopPropagation();
  void form.handleSubmit();
}

export function useTaskFormDialog(props: TaskFormDialogCoreProps) {
  const { open, mode, task, defaultStatus, defaultEntityId, onSubmit } = props;

  const form = useForm({
    defaultValues:
      mode === "edit" && task
        ? defaultsFromTask(task)
        : createDefaults(defaultStatus, defaultEntityId),
    onSubmit: createTaskFormSubmitHandler(onSubmit),
  });

  useEffect(() => {
    if (!open) return;
    resetTaskFormValues(form as TaskDialogForm, {
      open,
      mode,
      task,
      defaultStatus,
      defaultEntityId,
      onSubmit,
    });
  }, [open, mode, task, defaultEntityId, defaultStatus, form, onSubmit]);

  const handleSubmit = (event: SubmitEvent) => {
    preventTaskFormDefault(form as TaskDialogForm, event);
  };

  return { form: form as TaskDialogForm, handleSubmit };
}
