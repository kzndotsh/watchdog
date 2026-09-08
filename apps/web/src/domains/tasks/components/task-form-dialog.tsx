import { TaskFormFields } from "@/domains/tasks/components/task-form-dialog-fields";
/* oxlint-disable react/only-export-components -- dialog + form helpers re-export */
import { TaskFormDialogFooter } from "@/domains/tasks/components/task-form-dialog-footer";
import { useTaskFormDialog } from "@/domains/tasks/components/use-task-form-dialog";
import type { TaskFormValues } from "@/domains/tasks/lib/task-form";
import type { TaskRecord } from "@/domains/tasks/types";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/shadcn/dialog";
import type { TaskStatus } from "@watchdog/schemas";

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entities: EntityOption[];
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: TaskFormValues) => void | Promise<void>;
}

type CreateProps = BaseProps & {
  mode: "create";
  task?: never;
  defaultEntityId?: string | null;
  defaultStatus?: TaskStatus;
  onDelete?: never;
};

type EditProps = BaseProps & {
  mode: "edit";
  task: TaskRecord | null;
  defaultEntityId?: never;
  defaultStatus?: never;
  onDelete?: () => void | Promise<void>;
};

type Props = CreateProps | EditProps;

export function TaskFormDialog(props: Props) {
  const {
    open,
    onOpenChange,
    entities,
    busy = false,
    error = null,
    onSubmit,
    mode,
  } = props;

  const defaultStatus =
    mode === "create" ? (props.defaultStatus ?? "backlog") : "backlog";
  const defaultEntityId = mode === "create" ? props.defaultEntityId : null;
  const task = mode === "edit" ? props.task : null;
  const onDelete = mode === "edit" ? props.onDelete : undefined;

  const { form, handleSubmit } = useTaskFormDialog({
    open,
    mode,
    task,
    defaultStatus,
    defaultEntityId,
    onSubmit,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Edit task" : "New task"}
            </DialogTitle>
          </DialogHeader>

          <TaskFormFields form={form} entities={entities} busy={busy} />

          {error ? <FormInlineError>{error}</FormInlineError> : null}

          <TaskFormDialogFooter
            form={form}
            mode={mode}
            busy={busy}
            onOpenChange={onOpenChange}
            onDelete={onDelete}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
