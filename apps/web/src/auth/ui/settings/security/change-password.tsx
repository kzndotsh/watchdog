import {
  useAuth,
  useChangePassword,
  useFetchOptions,
  useListAccounts,
  useRequestPasswordReset,
  useSession
} from "@better-auth-ui/react"
import { Eye, EyeOff } from "lucide-react"
import { type SyntheticEvent, useState } from "react"
import { toast } from "@/shared/ui/shadcn/toast"

import { Button } from "@/shared/ui/shadcn/button"
import { Field, FieldError } from "@/shared/ui/shadcn/field"
import { FormSection } from "@/shared/ui/form-section"
import { Input } from "@/shared/ui/shadcn/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@/shared/ui/shadcn/input-group"
import { Label } from "@/shared/ui/shadcn/label"
import { Skeleton } from "@/shared/ui/shadcn/skeleton"
import { Spinner } from "@/shared/ui/shadcn/spinner"

export type ChangePasswordProps = {
  className?: string
}

/**
 * Render a card form for changing the authenticated user's password.
 *
 * When the user has a credential account, displays fields for current password,
 * new password, and optionally confirm password. When the user only has social
 * accounts, displays a prompt to set a password via the reset flow.
 *
 * @returns A JSX element containing the change-password or set-password card
 */
export function ChangePassword({ className }: ChangePasswordProps) {
  const { authClient, emailAndPassword, localization } = useAuth()
  const { data: session } = useSession(authClient)
  const { data: accounts, isPending: isAccountsPending } =
    useListAccounts(authClient)

  const hasCredentialAccount = accounts?.some(
    (account) => account.providerId === "credential"
  )

  if (!isAccountsPending && !hasCredentialAccount) {
    return <SetPassword className={className} />
  }

  return (
    <ChangePasswordForm
      className={className}
      emailAndPassword={emailAndPassword}
      localization={localization}
      session={isAccountsPending ? undefined : session}
    />
  )
}

function SetPassword({ className }: { className?: string }) {
  const { authClient, localization, plugins } = useAuth()
  const { data: session } = useSession(authClient)
  const { fetchOptions, resetFetchOptions } = useFetchOptions()

  const { mutate: requestPasswordReset, isPending } = useRequestPasswordReset(
    authClient,
    {
      onError: () => {
        resetFetchOptions()
      },
      onSuccess: () => toast.success(localization.auth.passwordResetEmailSent)
    }
  )

  const Captcha = plugins.find(
    (plugin) => plugin.captchaComponent
  )?.captchaComponent

  const handleSetPassword = () => {
    if (!session) return

    requestPasswordReset({ email: session.user.email, fetchOptions })
  }

  return (
    <FormSection
      title={localization.settings.changePassword}
      className={className}
      footer={
        <Button
          size="sm"
          disabled={isPending || !session?.user.email}
          onClick={handleSetPassword}
        >
          {isPending && <Spinner />}
          {localization.auth.sendResetLink}
        </Button>
      }
    >
      <div>
        <p className="text-sm font-medium leading-tight">
          {localization.settings.setPassword}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {localization.settings.setPasswordDescription}
        </p>
      </div>
      {Captcha ? <div>{Captcha}</div> : null}
    </FormSection>
  )
}

function ChangePasswordForm({
  className,
  emailAndPassword,
  localization,
  session
}: {
  className?: string
  emailAndPassword: ReturnType<typeof useAuth>["emailAndPassword"]
  localization: ReturnType<typeof useAuth>["localization"]
  session: ReturnType<typeof useSession>["data"]
}) {
  const { authClient } = useAuth()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const { mutate: changePassword, isPending } = useChangePassword(authClient, {
    onError: () => {
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    },
    onSuccess: () => {
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success(localization.settings.changePasswordSuccess)
    }
  })

  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false)

  const [fieldErrors, setFieldErrors] = useState<{
    currentPassword?: string
    newPassword?: string
    confirmPassword?: string
  }>({})

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (emailAndPassword.confirmPassword && newPassword !== confirmPassword) {
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.error(localization.auth.passwordsDoNotMatch)
      return
    }

    changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormSection
        title={localization.settings.changePassword}
        className={className}
        footer={
          <Button type="submit" size="sm" disabled={isPending || !session}>
            {isPending && <Spinner />}
            {localization.settings.updatePassword}
          </Button>
        }
      >
        <Field data-invalid={!!fieldErrors.currentPassword}>
          <Label htmlFor="currentPassword">
            {localization.settings.currentPassword}
          </Label>

          {session ? (
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              placeholder={localization.settings.currentPasswordPlaceholder}
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value)

                setFieldErrors((prev) => ({
                  ...prev,
                  currentPassword: undefined
                }))
              }}
              disabled={isPending}
              required
              onInvalid={(e) => {
                e.preventDefault()

                setFieldErrors((prev) => ({
                  ...prev,
                  currentPassword: (e.target as HTMLInputElement)
                    .validationMessage
                }))
              }}
              aria-invalid={!!fieldErrors.currentPassword}
            />
          ) : (
            <Skeleton>
              <Input className="invisible" />
            </Skeleton>
          )}

          <FieldError>{fieldErrors.currentPassword}</FieldError>
        </Field>

        <Field data-invalid={!!fieldErrors.newPassword}>
          <Label htmlFor="newPassword">{localization.auth.newPassword}</Label>

          {session ? (
            <InputGroup>
              <InputGroupInput
                id="newPassword"
                name="newPassword"
                type={isNewPasswordVisible ? "text" : "password"}
                autoComplete="new-password"
                placeholder={localization.auth.newPasswordPlaceholder}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)

                  setFieldErrors((prev) => ({
                    ...prev,
                    newPassword: undefined
                  }))
                }}
                minLength={emailAndPassword.minPasswordLength}
                maxLength={emailAndPassword.maxPasswordLength}
                disabled={isPending}
                required
                onInvalid={(e) => {
                  e.preventDefault()
                  setFieldErrors((prev) => ({
                    ...prev,
                    newPassword: (e.target as HTMLInputElement)
                      .validationMessage
                  }))
                }}
                aria-invalid={!!fieldErrors.newPassword}
              />

              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label={
                    isNewPasswordVisible
                      ? localization.auth.hidePassword
                      : localization.auth.showPassword
                  }
                  onClick={() => setIsNewPasswordVisible(!isNewPasswordVisible)}
                  disabled={isPending}
                >
                  {isNewPasswordVisible ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          ) : (
            <Skeleton>
              <Input className="invisible" />
            </Skeleton>
          )}

          <FieldError>{fieldErrors.newPassword}</FieldError>
        </Field>

        {emailAndPassword.confirmPassword ? (
          <Field data-invalid={!!fieldErrors.confirmPassword}>
            <Label htmlFor="confirmPassword">
              {localization.auth.confirmPassword}
            </Label>

            {session ? (
              <InputGroup>
                <InputGroupInput
                  id="confirmPassword"
                  name="confirmPassword"
                  type={isConfirmPasswordVisible ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={localization.auth.confirmPasswordPlaceholder}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)

                    setFieldErrors((prev) => ({
                      ...prev,
                      confirmPassword: undefined
                    }))
                  }}
                  minLength={emailAndPassword.minPasswordLength}
                  maxLength={emailAndPassword.maxPasswordLength}
                  disabled={isPending}
                  required
                  onInvalid={(e) => {
                    e.preventDefault()

                    setFieldErrors((prev) => ({
                      ...prev,
                      confirmPassword: (e.target as HTMLInputElement)
                        .validationMessage
                    }))
                  }}
                  aria-invalid={!!fieldErrors.confirmPassword}
                />

                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label={
                      isConfirmPasswordVisible
                        ? localization.auth.hidePassword
                        : localization.auth.showPassword
                    }
                    onClick={() =>
                      setIsConfirmPasswordVisible(!isConfirmPasswordVisible)
                    }
                    disabled={isPending}
                  >
                    {isConfirmPasswordVisible ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            ) : (
              <Skeleton>
                <Input className="invisible" />
              </Skeleton>
            )}

            <FieldError>{fieldErrors.confirmPassword}</FieldError>
          </Field>
        ) : null}
      </FormSection>
    </form>
  )
}
