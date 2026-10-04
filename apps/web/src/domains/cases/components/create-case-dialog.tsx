import { useForm } from "@tanstack/react-form";
import { useRef } from "react";

import { createCaseFn } from "@/domains/cases/cases.functions";
import { errMessage, nextAutoSlug } from "@/lib/utils";
import { fieldErrorList, fieldInvalid } from "@/shared/lib/field-errors";
import { Button } from "@/shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";
import { createCaseInputSchema } from "@watchdog/schemas";
import { Field, FieldError, FieldLabel } from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";
import { Spinner } from "@watchdog/ui/components/spinner";
import { Textarea } from "@watchdog/ui/components/textarea";

/** New Case dialog: name (slug follows it) and an optional description. */
export function CreateCaseDialog({
  open,
  onOpenChange,
  onCreated,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const lastNameRef = useRef("");

  const form = useForm({
    defaultValues: { name: "", slug: "", description: "" },
    onSubmit: async ({ value }) => {
      try {
        await createCaseFn({
          data: createCaseInputSchema.parse({
            name: value.name,
            slug: value.slug || undefined,
            description: value.description || undefined,
          }),
        });
        form.reset();
        lastNameRef.current = "";
        onOpenChange(false);
        onCreated();
      } catch (error) {
        onError(errMessage(error, "Create failed"));
      }
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset();
      lastNameRef.current = "";
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-3"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>New Case</DialogTitle>
            <DialogDescription>
              Cases are an isolated workspace for managing your investigation.
            </DialogDescription>
          </DialogHeader>

          <form.Field
            name="name"
            validators={{
              onSubmit: ({ value }) =>
                value.trim() ? undefined : "Enter a case name",
            }}
            listeners={{
              onChange: ({ value }) => {
                const auto = nextAutoSlug(
                  lastNameRef.current,
                  form.getFieldValue("slug"),
                  value
                );
                lastNameRef.current = value;
                if (auto !== null) form.setFieldValue("slug", auto);
              },
            }}
          >
            {(field) => (
              <Field data-invalid={fieldInvalid(field.state.meta)}>
                <FieldLabel htmlFor="new-case-title">Case name</FieldLabel>
                <Input
                  id="new-case-title"
                  autoFocus
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  placeholder="Case name…"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  disabled={form.state.isSubmitting}
                  aria-invalid={fieldInvalid(field.state.meta)}
                />
                {fieldInvalid(field.state.meta) ? (
                  <FieldError errors={fieldErrorList(field.state.meta)} />
                ) : null}
              </Field>
            )}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="case-description">Description</FieldLabel>
                <Textarea
                  id="case-description"
                  placeholder="Optional description…"
                  rows={3}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  disabled={form.state.isSubmitting}
                />
              </Field>
            )}
          </form.Field>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={form.state.isSubmitting}
              onClick={() => {
                handleOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => ({
                canSubmit: state.canSubmit,
                isSubmitting: state.isSubmitting,
                name: state.values.name,
              })}
            >
              {({ canSubmit, isSubmitting, name }) => (
                <Button
                  type="submit"
                  disabled={isSubmitting || !canSubmit || !name.trim()}
                >
                  {isSubmitting ? <Spinner /> : null}
                  Create
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
