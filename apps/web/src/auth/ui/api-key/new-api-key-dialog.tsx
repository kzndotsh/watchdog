"use client"

import { useAuth, useAuthPlugin } from "@better-auth-ui/react"
import { Check, Copy, Key } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { apiKeyPlugin } from "@/auth/plugins/api-key"

import { errMessage } from "@/lib/utils"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "@/shared/ui/shadcn/alert-dialog"
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput
} from "@/shared/ui/shadcn/input-group"
import { Label } from "@/shared/ui/shadcn/label"

export type NewApiKeyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string | null
  secretKey: string | null
}

export function NewApiKeyDialog({
  open,
  onOpenChange,
  name,
  secretKey
}: NewApiKeyDialogProps) {
  const { localization } = useAuth()
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin)

  const [copied, setCopied] = useState(false)

  const copySecretKey = async () => {
    if (!secretKey) return

    try {
      await navigator.clipboard.writeText(secretKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      toast.error(errMessage(error, "Copy failed"))
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Key />
          </AlertDialogMedia>

          <AlertDialogTitle>{apiKeyLocalization.newApiKey}</AlertDialogTitle>

          <AlertDialogDescription>
            {apiKeyLocalization.newApiKeyWarning}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="new-api-key-secret">
            {name || apiKeyLocalization.apiKey}
          </Label>

          <InputGroup>
            <InputGroupInput
              id="new-api-key-secret"
              value={secretKey ?? ""}
              readOnly
              className="font-mono text-xs"
            />

            <InputGroupButton
              size="icon-xs"
              aria-label={localization.settings.copyToClipboard}
              onClick={copySecretKey}
            >
              {copied ? <Check /> : <Copy />}
            </InputGroupButton>
          </InputGroup>
        </div>

        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)}>
            {apiKeyLocalization.dismissNewKey}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
