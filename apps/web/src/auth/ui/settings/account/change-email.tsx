import { useAuth, useChangeEmail, useSession } from "@better-auth-ui/react"
import { type SyntheticEvent, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/shared/ui/shadcn/button"
import { Field, FieldError } from "@/shared/ui/shadcn/field"
import { FormSection } from "@/shared/ui/form-section"
import { Input } from "@/shared/ui/shadcn/input"
import { Label } from "@/shared/ui/shadcn/label"
import { Skeleton } from "@/shared/ui/shadcn/skeleton"
import { Spinner } from "@/shared/ui/shadcn/spinner"

export type ChangeEmailProps = {
  className?: string
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
  const { authClient, baseURL, localization, viewPaths } = useAuth()
  const { data: session } = useSession(authClient)

  const { mutate: changeEmail, isPending } = useChangeEmail(authClient, {
    onSuccess: () => toast.success(localization.settings.changeEmailSuccess)
  })

  const [fieldErrors, setFieldErrors] = useState<{
    email?: string
  }>({})

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()

    const formData = new FormData(e.currentTarget)
    changeEmail({
      newEmail: (formData.get("email") as string).trim(),
      callbackURL: `${baseURL}/${viewPaths.settings.account}`
    })
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
                  email: undefined
                }))
              }}
              onInvalid={(e) => {
                e.preventDefault()
                setFieldErrors((prev) => ({
                  ...prev,
                  email: (e.target as HTMLInputElement).validationMessage
                }))
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
  )
}
