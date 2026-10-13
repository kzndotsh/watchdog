import { useForm } from "@tanstack/react-form";
import type { SubmitEvent } from "react";

import { fieldErrorList, fieldInvalid } from "@/shared/lib/field-errors";
import { Button } from "@/shared/ui/primitives/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";

export type UrlFormProps = {
  disabled: boolean;
  isLoading?: boolean;
  formId?: string;
  shouldShowSubmit?: boolean;
  shouldShowHint?: boolean;
  onSubmit: (data: { sourceUrl: string; label?: string }) => void;
};

export function UrlForm({
  disabled,
  isLoading,
  formId,
  shouldShowSubmit = true,
  shouldShowHint = true,
  onSubmit,
}: UrlFormProps) {
  const form = useForm({
    defaultValues: { url: "", label: "" },
    onSubmit: ({ value }) => {
      const url = value.url.trim();
      if (!url) return;
      onSubmit({
        sourceUrl: url,
        label: value.label.trim() || undefined,
      });
      form.reset();
    },
  });

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    e.stopPropagation();
    void form.handleSubmit();
  }

  return (
    <form id={formId} className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <FieldGroup>
        <form.Field
          name="url"
          validators={{
            onSubmit: ({ value }) => (value.trim() ? undefined : "Enter a URL"),
          }}
        >
          {(field) => (
            <Field data-invalid={fieldInvalid(field.state.meta)}>
              <FieldLabel>URL</FieldLabel>
              <Input
                aria-invalid={fieldInvalid(field.state.meta)}
                placeholder="Link or hostname"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                }}
                disabled={disabled}
              />
              {fieldInvalid(field.state.meta) ? (
                <FieldError errors={fieldErrorList(field.state.meta)} />
              ) : null}
            </Field>
          )}
        </form.Field>
        <form.Field name="label">
          {(field) => (
            <Field>
              <FieldLabel>Label (optional)</FieldLabel>
              <Input
                placeholder="Source page"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                }}
                disabled={disabled}
              />
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      {shouldShowHint ? (
        <p className="text-muted-foreground text-xs">
          Saves link metadata as Evidence. Use Enrich on the row to fetch live +
          Wayback.
        </p>
      ) : null}
      {shouldShowSubmit ? (
        <form.Subscribe
          selector={(state) => ({
            url: state.values.url,
          })}
        >
          {({ url }) => (
            <Button
              type="submit"
              size="sm"
              className="self-start"
              loading={isLoading}
              disabled={disabled || !url.trim()}
            >
              Add link
            </Button>
          )}
        </form.Subscribe>
      ) : null}
    </form>
  );
}
