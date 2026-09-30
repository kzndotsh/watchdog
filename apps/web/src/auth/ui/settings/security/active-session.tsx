import { useAuth, useRevokeSession, useSession } from "@better-auth-ui/react";
import type { Session } from "better-auth";
import Bowser from "bowser";
import { LogOut, Monitor, Smartphone, X } from "lucide-react";

import { Button } from "@/shared/ui/primitives/button";
import { formatRelativeTime } from "@/shared/ui/relative-time.lib";
import { toast } from "@/shared/ui/toast";
import { Card, CardContent } from "@watchdog/ui/components/card";
import { Spinner } from "@watchdog/ui/components/spinner";

export interface ActiveSessionProps {
  activeSession: Session;
}

/**
 * Render a single active session row with device info and revoke control.
 *
 * Shows the session's browser, OS, IP, and creation time. The current session is marked
 * and navigates to sign-out on click, while other sessions can be revoked individually.
 *
 * @param activeSession - The session object containing id, token, userAgent, ipAddress, and createdAt
 * @returns A JSX element containing the active session row
 */
export function ActiveSession({ activeSession }: ActiveSessionProps) {
  const { authClient, basePaths, localization, viewPaths, navigate } =
    useAuth();
  const { data: session } = useSession(authClient, { refetchOnMount: false });

  const { mutate: revokeSession, isPending: isRevoking } = useRevokeSession(
    authClient,
    {
      onSuccess: () =>
        toast.success(localization.settings.revokeSessionSuccess),
    }
  );

  const isCurrentSession = activeSession.token === session?.session.token;
  const ua = Bowser.parse(activeSession.userAgent || "");
  const isMobile =
    ua.platform.type === "mobile" || ua.platform.type === "tablet";

  return (
    <Card className="border-0 bg-transparent shadow-none ring-0">
      <CardContent className="flex items-center justify-between gap-3">
        <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
          {isMobile ? (
            <Smartphone className="size-4.5" />
          ) : (
            <Monitor className="size-4.5" />
          )}
        </div>

        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">
            {ua.browser.name || "Unknown Browser"}
            {ua.os.name ? `, ${ua.os.name}` : ""}
          </span>

          <span className="text-muted-foreground truncate text-xs">
            {activeSession.ipAddress || "No IP"}
          </span>

          {isCurrentSession ? (
            <span className="bg-primary/10 text-primary w-fit rounded-full px-2 py-0.5 text-xs font-medium">
              {localization.settings.currentSession}
            </span>
          ) : (
            activeSession.createdAt && (
              <span className="text-muted-foreground text-xs capitalize">
                {formatRelativeTime(activeSession.createdAt)}
              </span>
            )
          )}
        </div>

        <Button
          className="ml-auto shrink-0"
          variant="outline"
          size="sm"
          onClick={() => {
            if (isCurrentSession) {
              navigate({
                to: `${basePaths.auth}/${viewPaths.auth.signOut}`,
              });
            } else {
              revokeSession(activeSession);
            }
          }}
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
  );
}
