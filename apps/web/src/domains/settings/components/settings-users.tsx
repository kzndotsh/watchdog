"use client";

import { useSession } from "@better-auth-ui/react";
import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { useDisableUser } from "@/domains/settings/hooks/use-disable-user";
import { useEnableUser } from "@/domains/settings/hooks/use-enable-user";
import { useRevokeUserSessions } from "@/domains/settings/hooks/use-revoke-user-sessions";
import { usersKeys } from "@/domains/settings/queries";
import { cn, couldnt, messageOr } from "@/lib/utils";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { queryLoadError } from "@/shared/lib/query-load-error";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { FormSection } from "@/shared/ui/form-section";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { isInstanceAdminRole } from "@watchdog/schemas/shared";
import { DropdownMenuItem } from "@watchdog/ui/components/dropdown-menu";
import { Spinner } from "@watchdog/ui/components/spinner";

type ListedUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
};

const EMPTY_USERS: ListedUser[] = [];

async function loadUsers(): Promise<ListedUser[]> {
  const { data, error } = await authClient.admin.listUsers({
    query: { limit: 100, sortBy: "createdAt", sortDirection: "asc" },
  });
  if (error) {
    throw new Error(messageOr(error.message, couldnt("load", "users")));
  }
  return data?.users ?? EMPTY_USERS;
}

function roleLabel(role: string | null | undefined): string {
  return isInstanceAdminRole(role) ? "Server admin" : "User";
}

export function SettingsUsers() {
  const { data: session } = useSession(authClient);
  const selfId = session?.user.id;
  const usersQuery = useQuery({
    queryKey: usersKeys.all,
    queryFn: loadUsers,
    placeholderData: placeholderDataForQueryKey(usersKeys.all),
  });

  const disableUser = useDisableUser();
  const enableUser = useEnableUser();
  const revokeSessions = useRevokeUserSessions();

  const usersPending = listPending(usersQuery);
  const usersLoadError = queryLoadError(
    usersQuery,
    usersPending,
    couldnt("load", "users")
  );

  if (usersPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (usersLoadError !== null) {
    return (
      <FetchErrorAlert
        error={usersLoadError}
        onRetry={() => {
          void usersQuery.refetch();
        }}
      />
    );
  }

  const users = usersQuery.data ?? EMPTY_USERS;

  return (
    <div className="max-w-2xl space-y-6">
      <FormSection>
        <ul
          className={cn(
            "divide-y",
            placeholderDeemphasisClass(usersQuery.isPlaceholderData)
          )}
        >
          {users.map((row) => {
            const disabled = Boolean(row.banned);
            const isSelf = row.id === selfId;
            return (
              <li
                key={row.id}
                className="group flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{row.name || row.email}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {row.email} · {roleLabel(row.role)}
                    {disabled ? " · Disabled" : ""}
                  </p>
                </div>
                {isSelf ? null : (
                  <RowActionsMenu label={`Actions for ${row.email}`}>
                    {disabled ? (
                      <DropdownMenuItem
                        onClick={() => {
                          enableUser.mutate(row.id);
                        }}
                      >
                        Enable
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => {
                          disableUser.mutate(row.id);
                        }}
                      >
                        Disable
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        revokeSessions.mutate(row.id);
                      }}
                    >
                      Sign out all sessions
                    </DropdownMenuItem>
                  </RowActionsMenu>
                )}
              </li>
            );
          })}
        </ul>
      </FormSection>
    </div>
  );
}
