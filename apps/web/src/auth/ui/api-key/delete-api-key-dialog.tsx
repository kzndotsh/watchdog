import type {
  ApiKeyAuthClient,
  ListedApiKey,
} from "@better-auth-ui/core/plugins/api-key"
import { useAuth, useAuthPlugin } from "@better-auth-ui/react"
import { useDeleteApiKey } from "@better-auth-ui/react/plugins/api-key"
import { Key } from "lucide-react"
import { useState } from "react"

import { apiKeyPlugin } from "@/auth/plugins/api-key"

import { DestructiveConfirmDialog } from "@/shared/ui/destructive-confirm-dialog"
import { errMessage } from "@/lib/utils"

export type DeleteApiKeyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  apiKey: ListedApiKey
  /** Scope the delete payload to an organization (sets `configId`). */
  organizationId?: string
}

export function DeleteApiKeyDialog({
  open,
  onOpenChange,
  apiKey,
  organizationId
}: DeleteApiKeyDialogProps) {
  const { authClient } = useAuth()
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin)
  const [error, setError] = useState<string | null>(null)

  const { mutate: deleteApiKey, isPending: isDeleting } = useDeleteApiKey(
    authClient as ApiKeyAuthClient,
    {
      onSuccess: () => {
        setError(null)
        onOpenChange(false)
      },
      onError: (err: unknown) => {
        setError(errMessage(err, "Delete failed"))
      }
    }
  )

  const phrase = apiKey.name?.trim() || apiKey.start || apiKey.id

  return (
    <DestructiveConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
      title={apiKeyLocalization.deleteApiKey}
      description={apiKeyLocalization.deleteApiKeyWarning}
      confirmLabel={apiKeyLocalization.deleteApiKey}
      verificationPhrase={phrase}
      verificationLabel="Type the API key name"
      irreversibility="Revoking this API key cannot be undone."
      media={<Key />}
      loading={isDeleting}
      error={error}
      onConfirm={() =>
        deleteApiKey({
          keyId: apiKey.id,
          ...(organizationId ? { configId: "organization" } : {})
        })
      }
    />
  )
}
