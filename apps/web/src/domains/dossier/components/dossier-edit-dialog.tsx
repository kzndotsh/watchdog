import { useForm } from "@tanstack/react-form";
import { useEffect, type SubmitEvent } from "react";

import type { EntityRecord } from "@/domains/entities/types";
import { FieldSelect } from "@/shared/ui/field-select";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { RichTextEditor } from "@/shared/ui/rich-text";
import { Button } from "@/shared/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/shadcn/dialog";
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/shadcn/field";
import { Input } from "@/shared/ui/shadcn/input";
import { ENTITY_KIND_OPTIONS } from "@/shared/ui/vocab";
import { entityKindSchema, type EntityKind } from "@watchdog/schemas";

export interface DossierEditFormValues {
  name: string;
  kind: EntityKind;
  summary: string;
  notes: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: EntityRecord;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: DossierEditFormValues) => void | Promise<void>;
}

function defaultsFromRecord(entity: EntityRecord): DossierEditFormValues {
  return {
    name: entity.name,
    kind: entity.kind,
    summary: entity.summary ?? "",
    notes: entity.notes ?? "",
  };
}

function dossierEditFormIssues(v: DossierEditFormValues): string[] {
  const issues: string[] = [];
  if (!v.name.trim()) issues.push("Name is required");
  return issues;
}

export function DossierEditDialog({
  open,
  onOpenChange,
  entity,
  busy = false,
  error = null,
  onSubmit,
}: Props) {
  const form = useForm({
    defaultValues: defaultsFromRecord(entity),
    onSubmit: async ({ value }) => {
      if (dossierEditFormIssues(value).length > 0) return;
      await onSubmit({
        ...value,
        name: value.name.trim(),
      });
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(defaultsFromRecord(entity));
  }, [open, entity, form]);

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    e.stopPropagation();
    void form.handleSubmit();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit entity</DialogTitle>
          </DialogHeader>

          <FieldGroup className="gap-3">
            <form.Field name="name">
              {(field) => (
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => {
                      field.handleChange(e.target.value);
                    }}
                    disabled={busy}
                    aria-label="Entity name"
                    autoFocus
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="kind">
              {(field) => (
                <Field>
                  <FieldLabel>Kind</FieldLabel>
                  <FieldSelect
                    value={field.state.value}
                    options={ENTITY_KIND_OPTIONS}
                    onValueChange={(next) => {
                      field.handleChange(entityKindSchema.parse(next));
                    }}
                    disabled={busy}
                    aria-label="Entity kind"
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="summary">
              {(field) => (
                <Field>
                  <FieldLabel>Summary</FieldLabel>
                  <RichTextEditor
                    editorKey={`edit-summary:${entity.id}:${open}`}
                    value={field.state.value}
                    onChange={(next) => {
                      field.handleChange(next);
                    }}
                    onBlurShell={field.handleBlur}
                    disabled={busy}
                    ariaLabel="Summary"
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="notes">
              {(field) => (
                <Field>
                  <FieldLabel>Notes</FieldLabel>
                  <RichTextEditor
                    editorKey={`edit-notes:${entity.id}:${open}`}
                    value={field.state.value}
                    onChange={(next) => {
                      field.handleChange(next);
                    }}
                    onBlurShell={field.handleBlur}
                    disabled={busy}
                    ariaLabel="Notes"
                  />
                </Field>
              )}
            </form.Field>
          </FieldGroup>

          <FormInlineError>{error}</FormInlineError>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <form.Subscribe selector={(s) => s.values}>
              {(values) => (
                <Button
                  type="submit"
                  loading={busy}
                  disabled={dossierEditFormIssues(values).length > 0}
                >
                  Save
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
