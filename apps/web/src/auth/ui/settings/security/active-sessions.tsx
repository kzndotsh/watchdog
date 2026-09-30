"use client";

import { useAuth, useListSessions, useSession } from "@better-auth-ui/react";

import { cn } from "@/lib/utils";
import { ACCENT_CARD_SURFACE } from "@/shared/ui/form-section";
import { Card, CardContent } from "@watchdog/ui/components/card";
import { Separator } from "@watchdog/ui/components/separator";
import { Skeleton } from "@watchdog/ui/components/skeleton";

import { ActiveSession } from "./active-session";

export interface ActiveSessionsProps {
  className?: string;
}

/**
 * Render a card listing all active sessions for the current user with revoke controls.
 *
 * Shows each session's browser, OS, IP address, and creation time. The current session is marked
 * and navigates to sign-out on click, while other sessions can be revoked individually.
 *
 * @returns A JSX element containing the sessions card
 */
export function ActiveSessions({ className }: ActiveSessionsProps) {
  const { authClient, localization } = useAuth();
  const { data: session } = useSession(authClient);

  const { data: sessions, isPending } = useListSessions(authClient);

  const currentToken = session?.session.token;

  const activeSessions = [...(sessions ?? [])].sort((a, b) => {
    const aCurrent = a.token === currentToken;
    const bCurrent = b.token === currentToken;
    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
    const aAt = a.createdAt ? Date.parse(String(a.createdAt)) : 0;
    const bAt = b.createdAt ? Date.parse(String(b.createdAt)) : 0;
    return bAt - aAt;
  });

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">
        {localization.settings.activeSessions}
      </h2>

      <Card className={cn(ACCENT_CARD_SURFACE, "gap-0 p-0 py-0", className)}>
        <CardContent className="p-0">
          {isPending ? (
            <SessionRowSkeleton />
          ) : (
            activeSessions?.map((activeSession, index) => (
              <div key={activeSession.id}>
                {index > 0 && <Separator />}

                <ActiveSession activeSession={activeSession} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SessionRowSkeleton() {
  return (
    <Card className="border-0 bg-transparent shadow-none ring-0">
      <CardContent className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-md" />

        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      </CardContent>
    </Card>
  );
}
