import { useCreateOrganization } from "@better-auth-ui/react/plugins/organization";
import { useForm } from "@tanstack/react-form";
import { useRef, useState, type SubmitEvent } from "react";

import { authClient } from "@/auth/client";
import { OrgLogoField } from "@/domains/organization/components/org-logo-field";
import { OrgSlugField } from "@/domains/organization/components/org-slug-field";
import { useSlugAvailability } from "@/domains/organization/hooks/use-slug-availability";
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
  const [logo, setLogo] = useState<string | null>(null);
  // Mirrors of the form values: the logo preview and slug check render outside the fields.
  const [nameValue, setNameValue] = useState("");
  const [slugValue, setSlugValue] = useState("");
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
          ...(logo === null ? {} : { logo }),
        });
        onCreated();
      } catch (error) {
        setServerError(errMessage(error, "Couldn't create the organization"));
      }
    },
  });

  const availability = useSlugAvailability(slugValue);

  return (
    <form
      onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <FieldGroup>
        <OrgLogoField
          name={nameValue}
          value={logo}
          onChange={setLogo}
          disabled={create.isPending}
        />
        <form.Field
          name="name"
          validators={{
            onSubmit: ({ value }) =>
              value.trim() ? undefined : "Enter an organization name",
          }}
          listeners={{
            onChange: ({ value }) => {
              setNameValue(value);
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
        <form.Field
          name="slug"
          listeners={{
            onChange: ({ value }) => {
              setSlugValue(value);
            },
          }}
        >
          {(field) => (
            <OrgSlugField
              id="organization-slug"
              placeholder="acme-investigations"
              value={field.state.value}
              onChange={field.handleChange}
              availability={availability}
              disabled={create.isPending}
            />
          )}
        </form.Field>
      </FieldGroup>
      <FieldError>{serverError}</FieldError>
      <Button
        type="submit"
        loading={create.isPending}
        disabled={availability === "taken"}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
