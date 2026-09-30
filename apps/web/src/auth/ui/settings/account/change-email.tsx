import { useAuth, useChangeEmail, useSession } from "@better-auth-ui/react";
import { type SyntheticEvent, useState } from "react";

import { FormSection } from "@/shared/ui/form-section";
import { Button } from "@/shared/ui/primitives/button";
import { toast } from "@/shared/ui/toast";
import { Field, FieldError } from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";
import { Label } from "@watchdog/ui/components/label";
import { Skeleton } from "@watchdog/ui/components/skeleton";
import { Spinner } from "@watchdog/ui/components/spinner";

import { formString } from "../../form-data";

export interface ChangeEmailProps {
  className?: string;
}

/**
 * Render a card containing a form to view and update the authenticated user's email.
 *
 * Shows a loading skeleton until session data is available, displays the current
 * email as the form's default value, and sends a verification email to the
 * new address upon successful submission.
 *
 * @returns A JSX element rendering the change-email card and form
 */
export function ChangeEmail({ className }: ChangeEmailProps) {
  const { authClient, baseURL, localization, viewPaths } = useAuth();
  const { data: session } = useSession(authClient);

  const { mutate: changeEmail, isPending } = useChangeEmail(authClient, {
    onSuccess: () => toast.success(localization.settings.changeEmailSuccess),
  });

  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
  }>({});

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    changeEmail({
      newEmail: formString(formData, "email").trim(),
      callbackURL: `${baseURL}/${viewPaths.settings.account}`,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormSection
        title={localization.settings.changeEmail}
        className={className}
        footer={
          <Button type="submit" size="sm" disabled={isPending || !session}>
            {isPending && <Spinner />}
            {localization.settings.updateEmail}
          </Button>
        }
      >
        <Field data-invalid={!!fieldErrors.email}>
          <Label htmlFor="email">{localization.auth.email}</Label>

          {session ? (
            <Input
              key={session?.user.email}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={session?.user.email}
              placeholder={localization.auth.emailPlaceholder}
              disabled={isPending}
              required
              onChange={() => {
                setFieldErrors((prev) => ({
                  ...prev,
                  email: undefined,
                }));
              }}
              onInvalid={(e) => {
                e.preventDefault();
                setFieldErrors((prev) => ({
                  ...prev,
                  email: e.currentTarget.validationMessage,
                }));
              }}
              aria-invalid={!!fieldErrors.email}
            />
          ) : (
            <Skeleton>
              <Input className="invisible" />
            </Skeleton>
          )}

          <FieldError>{fieldErrors.email}</FieldError>
        </Field>
      </FormSection>
    </form>
  );
}
