import { TaskFormFields } from "@/domains/tasks/components/task-form-dialog-fields";
/* oxlint-disable react/only-export-components -- dialog + form helpers re-export */
import { TaskFormDialogFooter } from "@/domains/tasks/components/task-form-dialog-footer";
import { useTaskFormDialog } from "@/domains/tasks/components/use-task-form-dialog";
import type { TaskFormValues } from "@/domains/tasks/lib/task-form";
import type { TaskRecord } from "@/domains/tasks/types";
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
  /** The Case whose Entities the picker searches (#559). */
  caseId: string;
  isBusy?: boolean;
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

/** The dialog's props minus its shell: `isBusy` and `error` arrive resolved. */
type FormBodyProps<P = Props> = P extends unknown
  ? Omit<P, "open" | "isBusy" | "error"> & {
      isBusy: boolean;
      error: string | null;
    }
  : never;

function TaskFormBody(props: FormBodyProps) {
  const { onOpenChange, caseId, isBusy, error, onSubmit, mode } = props;

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

      <TaskFormFields form={form} caseId={caseId} isBusy={isBusy} />

      {error ? <FieldError>{error}</FieldError> : null}

      <TaskFormDialogFooter
        form={form}
        mode={mode}
        isBusy={isBusy}
        onOpenChange={onOpenChange}
        onDelete={onDelete}
      />
    </form>
  );
}

export function TaskFormDialog({
  open,
  onOpenChange,
  isBusy = false,
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
          isBusy={isBusy}
          error={error}
          {...rest}
        />
      </DialogContent>
    </Dialog>
  );
}
