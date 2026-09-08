"use client";

import { useSession } from "@better-auth-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { authClient } from "@/auth/client";
import { isInstanceAdmin } from "@/auth/instance-admin";
import { errMessage, cn } from "@/lib/utils";
import { FormSection } from "@/shared/ui/form-section";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { DropdownMenuItem } from "@/shared/ui/shadcn/dropdown-menu";
import { Spinner } from "@/shared/ui/shadcn/spinner";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { queryLoadError } from "@/shared/lib/query-load-error";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";

const USERS_QUERY_KEY = ["auth-admin", "users"] as const;

interface ListedUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
}

const EMPTY_USERS: ListedUser[] = [];

async function loadUsers(): Promise<ListedUser[]> {
  const { data, error } = await authClient.admin.listUsers({
    query: { limit: 100, sortBy: "createdAt", sortDirection: "asc" },
  });
  if (error) {
    throw new Error(error.message || "Could not load users");
  }
  return (data?.users ?? EMPTY_USERS) as ListedUser[];
}

function roleLabel(role: string | null | undefined): string {
  return isInstanceAdmin(role) ? "Install admin" : "User";
}

export function UsersSettings() {
  const queryClient = useQueryClient();
  const { data: session } = useSession(authClient);
  const selfId = session?.user.id;
  const usersQuery = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: loadUsers,
    placeholderData: placeholderDataForQueryKey(USERS_QUERY_KEY),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });

  const disableUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await authClient.admin.banUser({
        userId,
        banReason: "disabled",
      });
      if (error) throw new Error(error.message || "Could not disable user");
    },
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(errMessage(error, "Could not disable user"));
    },
  });

  const enableUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await authClient.admin.unbanUser({ userId });
      if (error) throw new Error(error.message || "Could not enable user");
    },
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(errMessage(error, "Could not enable user"));
    },
  });

  const revokeSessions = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await authClient.admin.revokeUserSessions({ userId });
      if (error) {
        throw new Error(error.message || "Could not sign out sessions");
      }
    },
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(errMessage(error, "Could not sign out sessions"));
    },
  });

  const usersPending = listPending(usersQuery);
  const usersLoadError = queryLoadError(
    usersQuery,
    usersPending,
    "Could not load users"
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
      <FormSection
        title="Users"
        description="Install accounts. Organization membership is on Team. Disable blocks sign-in and ends sessions."
      >
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
                  <p className="truncate text-sm font-medium">
                    {row.name || row.email}
                  </p>
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
