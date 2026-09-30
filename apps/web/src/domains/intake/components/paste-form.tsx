import { useForm } from "@tanstack/react-form";
import type { SubmitEvent } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/shadcn/field";
import { Input } from "@/shared/ui/shadcn/input";
import { Textarea } from "@/shared/ui/shadcn/textarea";

export interface PasteFormProps {
  disabled: boolean;
  loading?: boolean;
  formId?: string;
  showSubmit?: boolean;
  onSubmit: (data: {
    body: string;
    label?: string;
    sourceUrl?: string;
  }) => void;
}

export function PasteForm({
  disabled,
  loading,
  formId,
  showSubmit = true,
  onSubmit,
}: PasteFormProps) {
  const form = useForm({
    defaultValues: { body: "", label: "", sourceUrl: "" },
    onSubmit: ({ value }) => {
      const body = value.body.trim();
      if (!body) return;
      onSubmit({
        body: value.body,
        label: value.label.trim() || undefined,
        sourceUrl: value.sourceUrl.trim() || undefined,
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
          name="body"
          validators={{
            onSubmit: ({ value }) =>
              value.trim() ? undefined : "Paste some content",
          }}
        >
          {(field) => (
            <Field>
              <FieldLabel>Content</FieldLabel>
              <Textarea
                size="sm"
                mono
                className="min-h-40"
                placeholder="Paste page text, tool output, notes…"
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
        <div className="grid gap-3 sm:grid-cols-2">
          <form.Field name="label">
            {(field) => (
              <Field>
                <FieldLabel>Label (optional)</FieldLabel>
                <Input
                  placeholder="WHOIS dump"
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
          <form.Field name="sourceUrl">
            {(field) => (
              <Field>
                <FieldLabel>Source URL (optional)</FieldLabel>
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
        </div>
      </FieldGroup>
      {showSubmit ? (
        <form.Subscribe
          selector={(state) => ({
            body: state.values.body,
          })}
        >
          {({ body }) => (
            <Button
              type="submit"
              size="sm"
              className="self-start"
              loading={loading}
              disabled={disabled || !body.trim()}
            >
              Add Evidence
            </Button>
          )}
        </form.Subscribe>
      ) : null}
    </form>
  );
}
