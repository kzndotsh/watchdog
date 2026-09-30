"use client";

import { useAuth, useSession, useUpdateUser } from "@better-auth-ui/react";
import { type SyntheticEvent, useState } from "react";

import { FormSection } from "@/shared/ui/form-section";
import { Button } from "@/shared/ui/primitives/button";
import { toast } from "@/shared/ui/toast";
import { Field, FieldError } from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";
import { Label } from "@watchdog/ui/components/label";
import { Skeleton } from "@watchdog/ui/components/skeleton";
import { Spinner } from "@watchdog/ui/components/spinner";

import { ChangeAvatar } from "./change-avatar";

export interface UserProfileProps {
  className?: string;
}

/**
 * Render a profile card that lets the authenticated user view and update their display name, username, and avatar.
 *
 * @param className - Optional additional CSS class names applied to the card container
 * @returns A JSX element containing the profile card with avatar upload and editable name/username fields
 */
export function UserProfile({ className }: UserProfileProps) {
  const { authClient, localization } = useAuth();
  const { data: session } = useSession(authClient);

  const { mutate: updateUser, isPending } = useUpdateUser(authClient, {
    onSuccess: () => toast.success(localization.settings.profileUpdatedSuccess),
  });

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
  }>({});

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const name = (formData.get("name") as string).trim();

    updateUser({
      name,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormSection
        title={localization.settings.userProfile}
        className={className}
        footer={
          <Button type="submit" size="sm" disabled={isPending || !session}>
            {isPending && <Spinner />}
            {localization.settings.saveChanges}
          </Button>
        }
      >
        <ChangeAvatar />

        <Field data-invalid={!!fieldErrors.name}>
          <Label htmlFor="name">{localization.auth.name}</Label>

          {session ? (
            <Input
              key={session?.user.name}
              id="name"
              name="name"
              autoComplete="name"
              defaultValue={session?.user.name}
              placeholder={localization.auth.name}
              disabled={isPending}
              required
              onChange={() => {
                setFieldErrors((prev) => ({
                  ...prev,
                  name: undefined,
                }));
              }}
              onInvalid={(e) => {
                e.preventDefault();

                setFieldErrors((prev) => ({
                  ...prev,
                  name: (e.target as HTMLInputElement).validationMessage,
                }));
              }}
              aria-invalid={!!fieldErrors.name}
            />
          ) : (
            <Skeleton>
              <Input className="invisible" />
            </Skeleton>
          )}

          <FieldError>{fieldErrors.name}</FieldError>
        </Field>
      </FormSection>
    </form>
  );
}
