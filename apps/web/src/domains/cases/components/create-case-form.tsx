import { useForm } from "@tanstack/react-form";
import { useRef } from "react";

import { createCaseFn } from "@/domains/cases/cases.functions";
import type { CaseRecord } from "@/domains/cases/types";
import { couldnt, errMessage, nextAutoSlug } from "@/lib/utils";
import { fieldErrorList, fieldInvalid } from "@/shared/lib/field-errors";
import { Button } from "@/shared/ui/primitives/button";
import { createCaseInputSchema } from "@watchdog/schemas/cases";
import { Field, FieldError, FieldLabel } from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";
import { Spinner } from "@watchdog/ui/components/spinner";
import { Textarea } from "@watchdog/ui/components/textarea";

type CreateCaseFormProps = {
  onCreated: (created: CaseRecord) => void;
  onError: (message: string) => void;
  /** Shows a Cancel button (the dialog); the onboarding step has none. */
  onCancel?: () => void;
};

/**
 * The one create-Case form: name (the slug follows it) and an optional description.
 * The New Case dialog and the first-Case onboarding step both render it. The server
 * function also makes the new Case the Active Case (cookie), so `onCreated` only has to
 * refresh and navigate.
 */
export function CreateCaseForm({
  onCreated,
  onError,
  onCancel,
}: CreateCaseFormProps) {
  const lastNameRef = useRef("");

  const form = useForm({
    defaultValues: { name: "", slug: "", description: "" },
    onSubmit: async ({ value }) => {
      try {
        const created = await createCaseFn({
          data: createCaseInputSchema.parse({
            name: value.name,
            slug: value.slug || undefined,
            description: value.description || undefined,
          }),
        });
        onCreated(created);
      } catch (error) {
        onError(errMessage(error, couldnt("create", "Case")));
      }
    },
  });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
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

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            disabled={form.state.isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
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
      </div>
    </form>
  );
}
