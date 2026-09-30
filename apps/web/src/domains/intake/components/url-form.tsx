import { useForm } from "@tanstack/react-form";
import type { SubmitEvent } from "react";

import { Button } from "@/shared/ui/primitives/button";
import { Input } from "@/shared/ui/primitives/input";
import { Field, FieldGroup, FieldLabel } from "@watchdog/ui/components/field";

export interface UrlFormProps {
  disabled: boolean;
  loading?: boolean;
  formId?: string;
  showSubmit?: boolean;
  showHint?: boolean;
  onSubmit: (data: { sourceUrl: string; label?: string }) => void;
}

export function UrlForm({
  disabled,
  loading,
  formId,
  showSubmit = true,
  showHint = true,
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
            <Field>
              <FieldLabel>URL</FieldLabel>
              <Input
                placeholder="Link or hostname"
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
      {showHint ? (
        <p className="text-muted-foreground text-xs">
          Saves link metadata as Evidence. Use Enrich on the row to fetch live +
          Wayback.
        </p>
      ) : null}
      {showSubmit ? (
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
              loading={loading}
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
