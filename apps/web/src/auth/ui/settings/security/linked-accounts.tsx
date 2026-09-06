"use client"

import { getProviderId } from "@better-auth-ui/core"
import { useAuth, useListAccounts } from "@better-auth-ui/react"
import type { SocialProvider } from "better-auth/social-providers"
import { Card, CardContent } from "@/shared/ui/shadcn/card"
import { Separator } from "@/shared/ui/shadcn/separator"
import { Skeleton } from "@/shared/ui/shadcn/skeleton"
import { ACCENT_CARD_SURFACE } from "@/shared/ui/form-section"
import { cn } from "@/lib/utils"
import { LinkedAccount } from "./linked-account"

export type LinkedAccountsProps = {
  className?: string
}

/**
 * Render a card showing linked social accounts and available social providers to link.
 *
 * Linked accounts (excluding the "credential" provider) are shown with an unlink control;
 * available providers are shown with a link control. Button states and labels reflect
 * ongoing link/unlink activity and use localization for provider-specific text.
 *
 * @returns A JSX element containing the linked accounts card
 */
export function LinkedAccounts({ className }: LinkedAccountsProps) {
  const {
    authClient,
    localization,
    multipleAccountsPerProvider,
    socialProviders
  } = useAuth()

  const { data: accounts, isPending } = useListAccounts(authClient)

  const linkedAccounts = accounts?.filter(
    (account) => account.providerId !== "credential"
  )

  const linkedProviderIds = new Set(linkedAccounts?.map((a) => a.providerId))

  const availableProviders =
    multipleAccountsPerProvider === false
      ? socialProviders?.filter(
          (provider) => !linkedProviderIds.has(getProviderId(provider))
        )
      : socialProviders

  const allRows = [
    ...(linkedAccounts?.map((account) => ({
      key: account.id,
      account,
      provider: account.providerId as SocialProvider,
    })) ?? []),
    ...(availableProviders?.map((provider) => ({
      key: getProviderId(provider),
      account: undefined,
      provider: getProviderId(provider) as SocialProvider,
    })) ?? []),
  ]

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3">
        {localization.settings.linkedAccounts}
      </h2>

      <Card className={cn(ACCENT_CARD_SURFACE, "gap-0 p-0 py-0", className)}>
        <CardContent className="p-0">
          {isPending
            ? socialProviders?.map((provider, index) => (
                <div key={getProviderId(provider)}>
                  {index > 0 && <Separator />}
                  <AccountRowSkeleton />
                </div>
              ))
            : allRows.map((row, index) => (
                <div key={row.key}>
                  {index > 0 && <Separator />}

                  <LinkedAccount
                    account={row.account}
                    provider={row.provider}
                  />
                </div>
              ))}
        </CardContent>
      </Card>
    </div>
  )
}

function AccountRowSkeleton() {
  return (
    <Card className="bg-transparent border-0 ring-0 shadow-none">
      <CardContent className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-md" />

        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      </CardContent>
    </Card>
  )
}
