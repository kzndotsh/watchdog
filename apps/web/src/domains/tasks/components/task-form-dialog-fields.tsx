import type { TaskDialogForm } from "@/domains/tasks/components/task-form-dialog-form";
import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";
import { FieldSelect } from "@/shared/ui/field-select";
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/shadcn/field";
import { Input } from "@/shared/ui/shadcn/input";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from "@/shared/ui/vocab";
import {
  trimmedTaskPrioritySchema,
  trimmedTaskStatusSchema,
} from "@watchdog/schemas";

export function TaskFormFields({
  form,
  entities,
  busy,
}: {
  form: TaskDialogForm;
  entities: EntityOption[];
  busy: boolean;
}) {
  return (
    <FieldGroup className="gap-3">
      <form.Field name="title">
        {(field) => (
          <Field>
            <FieldLabel>Title</FieldLabel>
            <Input
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              disabled={busy}
              aria-label="Task title"
              autoFocus
            />
          </Field>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <Field>
            <FieldLabel>Description</FieldLabel>
            <Textarea
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              disabled={busy}
              aria-label="Task description"
              className="min-h-20"
            />
          </Field>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="status">
          {(field) => (
            <Field>
              <FieldLabel>Status</FieldLabel>
              <FieldSelect
                value={field.state.value}
                options={TASK_STATUS_OPTIONS}
                onValueChange={(next) => {
                  field.handleChange(trimmedTaskStatusSchema.parse(next));
                }}
                disabled={busy}
                aria-label="Task status"
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="priority">
          {(field) => (
            <Field>
              <FieldLabel>Priority</FieldLabel>
              <FieldSelect
                value={field.state.value}
                options={[
                  { value: "", label: "None" },
                  ...TASK_PRIORITY_OPTIONS,
                ]}
                onValueChange={(next) => {
                  field.handleChange(
                    next === "" ? "" : trimmedTaskPrioritySchema.parse(next)
                  );
                }}
                disabled={busy}
                aria-label="Task priority"
              />
            </Field>
          )}
        </form.Field>
      </div>

      <form.Field name="dueDate">
        {(field) => (
          <Field>
            <FieldLabel>Due date</FieldLabel>
            <Input
              type="date"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              disabled={busy}
              aria-label="Due date"
            />
          </Field>
        )}
      </form.Field>

      <form.Field name="entityId">
        {(field) => (
          <Field>
            <FieldLabel>Entity</FieldLabel>
            <EntityCombobox
              entities={entities}
              value={field.state.value}
              onValueChange={(id) => {
                field.handleChange(id);
              }}
              disabled={busy}
              emptyLabel="No entity"
              aria-label="Linked entity"
            />
          </Field>
        )}
      </form.Field>
    </FieldGroup>
  );
}
