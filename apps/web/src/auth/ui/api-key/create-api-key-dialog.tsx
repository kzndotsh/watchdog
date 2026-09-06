import type { ApiKeyAuthClient } from "@better-auth-ui/core/plugins/api-key"
import { useAuth, useAuthPlugin } from "@better-auth-ui/react"
import { useCreateApiKey } from "@better-auth-ui/react/plugins/api-key"
import { Key } from "lucide-react"
import { type SyntheticEvent, useState } from "react"

import { apiKeyPlugin } from "@/auth/plugins/api-key"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "@/shared/ui/shadcn/alert-dialog"
import { Button } from "@/shared/ui/shadcn/button"
import { Field, FieldError } from "@/shared/ui/shadcn/field"
import { Input } from "@/shared/ui/shadcn/input"
import { Label } from "@/shared/ui/shadcn/label"
import { Spinner } from "@/shared/ui/shadcn/spinner"
import { NewApiKeyDialog } from "./new-api-key-dialog"

export type CreateApiKeyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Create an organization-owned key by passing the organization id. */
  organizationId?: string
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  organizationId
}: CreateApiKeyDialogProps) {
  const { authClient, localization } = useAuth()
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin)

  const { mutate: createApiKey, isPending: isCreating } = useCreateApiKey(
    authClient as ApiKeyAuthClient
  )

  const [isNewKeyDialogOpen, setIsNewKeyDialogOpen] = useState(false)
  const [keyName, setKeyName] = useState<string | null>(null)
  const [secretKey, setSecretKey] = useState<string | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setKeyName(null)
      setSecretKey(null)
    }

    onOpenChange(nextOpen)
  }

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formData = new FormData(e.target as HTMLFormElement)
    const name = (formData.get("name") as string).trim()

    const payload =
      name || organizationId
        ? {
            ...(name ? { name } : {}),
            ...(organizationId
              ? { organizationId, configId: "organization" }
              : {})
          }
        : undefined

    createApiKey(payload, {
      onSuccess: (result) => {
        handleOpenChange(false)
        setKeyName(name)
        setSecretKey(result.key)
        setIsNewKeyDialogOpen(true)
      }
    })
  }

  return (
    <>
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Key />
              </AlertDialogMedia>

              <AlertDialogTitle>
                {apiKeyLocalization.createApiKey}
              </AlertDialogTitle>

              <AlertDialogDescription>
                {apiKeyLocalization.apiKeysDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <Field>
              <Label htmlFor="api-key-name">{apiKeyLocalization.name}</Label>

              <Input
                id="api-key-name"
                name="name"
                autoFocus
                placeholder={localization.settings.optional}
                disabled={isCreating}
              />

              <FieldError />
            </Field>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isCreating}>
                {localization.settings.cancel}
              </AlertDialogCancel>

              <Button type="submit" disabled={isCreating}>
                {isCreating && <Spinner />}

                {apiKeyLocalization.createApiKey}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <NewApiKeyDialog
        open={isNewKeyDialogOpen}
        onOpenChange={setIsNewKeyDialogOpen}
        secretKey={secretKey}
        name={keyName}
      />
    </>
  )
}
