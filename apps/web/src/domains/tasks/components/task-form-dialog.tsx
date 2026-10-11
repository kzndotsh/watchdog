import { TaskFormFields } from "@/domains/tasks/components/task-form-dialog-fields";
/* oxlint-disable react/only-export-components -- dialog + form helpers re-export */
import { TaskFormDialogFooter } from "@/domains/tasks/components/task-form-dialog-footer";
import { useTaskFormDialog } from "@/domains/tasks/components/use-task-form-dialog";
import type { TaskFormValues } from "@/domains/tasks/lib/task-form";
import type { TaskRecord } from "@/domains/tasks/types";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";
import type { TaskStatus } from "@watchdog/schemas/shared";
import { FieldError } from "@watchdog/ui/components/field";

type BaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entities: EntityOption[];
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: TaskFormValues) => void | Promise<void>;
};

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

/** The dialog's props minus its shell: `busy` and `error` arrive resolved. */
type FormBodyProps<P = Props> = P extends unknown
  ? Omit<P, "open" | "busy" | "error"> & {
      busy: boolean;
      error: string | null;
    }
  : never;

function TaskFormBody(props: FormBodyProps) {
  const { onOpenChange, entities, busy, error, onSubmit, mode } = props;

  const defaultStatus =
    mode === "create" ? (props.defaultStatus ?? "backlog") : "backlog";
  const defaultEntityId = mode === "create" ? props.defaultEntityId : null;
  const task = mode === "edit" ? props.task : null;
  const onDelete = mode === "edit" ? props.onDelete : undefined;

  const { form, handleSubmit } = useTaskFormDialog({
    mode,
    task,
    defaultStatus,
    defaultEntityId,
    onSubmit,
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{mode === "edit" ? "Edit task" : "New task"}</DialogTitle>
      </DialogHeader>

      <TaskFormFields form={form} entities={entities} busy={busy} />

      {error ? <FieldError>{error}</FieldError> : null}

      <TaskFormDialogFooter
        form={form}
        mode={mode}
        busy={busy}
        onOpenChange={onOpenChange}
        onDelete={onDelete}
      />
    </form>
  );
}

export function TaskFormDialog({
  open,
  onOpenChange,
  busy = false,
  error = null,
  ...rest
}: Props) {
  // The form remounts for another task or another create context, so its values
  // always start from what is on screen; nothing resets it afterwards.
  const formKey =
    rest.mode === "edit"
      ? `edit:${rest.task?.id ?? ""}`
      : `create:${rest.defaultStatus ?? "backlog"}:${rest.defaultEntityId ?? ""}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <TaskFormBody
          key={formKey}
          onOpenChange={onOpenChange}
          busy={busy}
          error={error}
          {...rest}
        />
      </DialogContent>
    </Dialog>
  );
}
