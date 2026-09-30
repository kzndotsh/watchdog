import { useCreateOrganization } from "@better-auth-ui/react/plugins/organization";
import { useForm } from "@tanstack/react-form";
import { useRef, useState, type SubmitEvent } from "react";

import { authClient } from "@/auth/client";
import { errMessage, nextAutoSlug, slugifyName } from "@/lib/utils";
import { fieldInvalid } from "@/shared/lib/field-errors";
import { FieldMessage } from "@/shared/ui/field-message";
import { Button } from "@/shared/ui/primitives/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";

/** Name + URL slug; the slug follows the name until edited. Creating makes you the owner. */
export function CreateOrganizationForm({
  submitLabel = "Create organization",
  onCreated,
}: {
  submitLabel?: string;
  onCreated: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const lastNameRef = useRef("");
  const create = useCreateOrganization(authClient);

  const form = useForm({
    defaultValues: { name: "", slug: "" },
    onSubmit: async ({ value }) => {
      setServerError(null);
      try {
        await create.mutateAsync({
          name: value.name.trim(),
          slug: value.slug.trim() || slugifyName(value.name),
        });
        onCreated();
      } catch (error) {
        setServerError(errMessage(error, "Could not create the organization"));
      }
    },
  });

  return (
    <form
      onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <FieldGroup>
        <form.Field
          name="name"
          validators={{
            onSubmit: ({ value }) =>
              value.trim() ? undefined : "Enter an organization name",
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
              <FieldLabel htmlFor="organization-name">Name</FieldLabel>
              <Input
                id="organization-name"
                autoFocus
                autoComplete="organization"
                placeholder="Acme Investigations"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                }}
                aria-invalid={fieldInvalid(field.state.meta)}
                disabled={create.isPending}
              />
              <FieldMessage meta={field.state.meta} />
            </Field>
          )}
        </form.Field>
        <form.Field name="slug">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="organization-slug">URL name</FieldLabel>
              <Input
                id="organization-slug"
                className="font-mono"
                placeholder="acme-investigations"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                }}
                disabled={create.isPending}
              />
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <FieldError>{serverError}</FieldError>
      <Button type="submit" loading={create.isPending}>
        {submitLabel}
      </Button>
    </form>
  );
}
