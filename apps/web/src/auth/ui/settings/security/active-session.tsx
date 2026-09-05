import { useAuth, useRevokeSession, useSession } from "@better-auth-ui/react"
import type { Session } from "better-auth"
import Bowser from "bowser"
import { LogOut, Monitor, Smartphone, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/shared/ui/shadcn/button"
import { Card, CardContent } from "@/shared/ui/shadcn/card"
import { Spinner } from "@/shared/ui/shadcn/spinner"
import { formatRelativeTime } from "@/shared/ui/relative-time.lib";

export type ActiveSessionProps = {
  activeSession: Session
}

/**
 * Render a single active session row with device info and revoke control.
 *
 * Shows the session's browser, OS, IP, user agent, and creation time. The current session is marked
 * and navigates to sign-out on click, while other sessions can be revoked individually.
 *
 * @param session - The session object containing id, token, userAgent, ipAddress, and createdAt
 * @returns A JSX element containing the active session row
 */
export function ActiveSession({ activeSession }: ActiveSessionProps) {
  const { authClient, basePaths, localization, viewPaths, navigate } = useAuth()
  const { data: session } = useSession(authClient, { refetchOnMount: false })

  const { mutate: revokeSession, isPending: isRevoking } = useRevokeSession(
    authClient,
    {
      onSuccess: () => toast.success(localization.settings.revokeSessionSuccess)
    }
  )

  const isCurrentSession = activeSession.token === session?.session.token
  const ua = Bowser.parse(activeSession.userAgent || "")
  const isMobile =
    ua.platform.type === "mobile" || ua.platform.type === "tablet"

  return (
    <Card className="bg-transparent border-0 ring-0 shadow-none">
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          {isMobile ? (
            <Smartphone className="size-4.5" />
          ) : (
            <Monitor className="size-4.5" />
          )}
        </div>

        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">
            {ua.browser.name || "Unknown Browser"}
            {ua.os.name ? `, ${ua.os.name}` : ""}
          </span>

          <span className="text-xs text-muted-foreground truncate">
            {activeSession.ipAddress || "No IP"}
            {activeSession.userAgent
              ? ` · ${activeSession.userAgent}`
              : ""}
          </span>

          {isCurrentSession ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary w-fit">
              {localization.settings.currentSession}
            </span>
          ) : (
            activeSession.createdAt && (
              <span className="text-xs text-muted-foreground capitalize">
                {formatRelativeTime(activeSession.createdAt)}
              </span>
            )
          )}
        </div>

        <Button
          className="ml-auto shrink-0"
          variant="outline"
          size="sm"
          onClick={() =>
            isCurrentSession
              ? navigate({
                  to: `${basePaths.auth}/${viewPaths.auth.signOut}`
                })
              : revokeSession(activeSession)
          }
          disabled={isRevoking}
          aria-label={
            isCurrentSession
              ? localization.auth.signOut
              : localization.settings.revokeSession
          }
        >
          {isRevoking ? <Spinner /> : isCurrentSession ? <LogOut /> : <X />}

          {isCurrentSession
            ? localization.auth.signOut
            : localization.settings.revoke}
        </Button>
      </CardContent>
    </Card>
  )
}
