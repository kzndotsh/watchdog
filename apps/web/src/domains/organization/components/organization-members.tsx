"use client";

import { useSession } from "@better-auth-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { authClient } from "@/auth/client";
import { cn, errMessage, messageOr } from "@/lib/utils";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { queryLoadError } from "@/shared/lib/query-load-error";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { TOAST_COPIED } from "@/shared/lib/toast-copy";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { FieldSelect } from "@/shared/ui/field-select";
import { FormSection } from "@/shared/ui/form-section";
import { Button } from "@/shared/ui/primitives/button";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { toast } from "@/shared/ui/toast";
import {
  buildInvitationAcceptUrl,
  invitationAcceptPath,
} from "@watchdog/auth/invitation-url";
import { canManageTeam, INVITE_ROLE_OPTIONS } from "@watchdog/auth/org-roles";
import { trimmedOrUndefined } from "@watchdog/schemas/shared";
import { DropdownMenuItem } from "@watchdog/ui/components/dropdown-menu";
import { Field } from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";
import { Label } from "@watchdog/ui/components/label";
import { Spinner } from "@watchdog/ui/components/spinner";

interface OrgMember {
  id: string;
  role: string;
  userId: string;
  user?: { name?: string | null; email?: string | null };
}

interface OrgInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
}

const EMPTY_MEMBERS: OrgMember[] = [];
const EMPTY_INVITATIONS: OrgInvitation[] = [];

const PAGE_SIZE = 10;

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "owner", label: "Owners" },
  { value: "admin", label: "Admins" },
  { value: "member", label: "Members" },
] as const;

const TEAM_QUERY_KEY = ["auth-org", "team"] as const;

function hasRole(roles: string, role: string): boolean {
  return roles.split(",").some((part) => part.trim() === role);
}

function memberMatches(
  member: OrgMember,
  search: string,
  roleFilter: string
): boolean {
  if (roleFilter !== "all" && !hasRole(member.role, roleFilter)) return false;
  const needle = search.trim().toLowerCase();
  if (needle === "") return true;
  return [member.user?.name, member.user?.email].some((value) =>
    (value ?? "").toLowerCase().includes(needle)
  );
}

async function copyInviteLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast.success(TOAST_COPIED);
  } catch (error) {
    toast.error(errMessage(error, "Copy failed"));
  }
}

function invitationAcceptUrl(invitationId: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return origin
    ? buildInvitationAcceptUrl(origin, invitationId)
    : invitationAcceptPath(invitationId);
}

async function loadTeam() {
  const [membersResult, invitationsResult] = await Promise.all([
    authClient.organization.listMembers(),
    authClient.organization.listInvitations(),
  ]);
  if (membersResult.error) {
    throw new Error(
      messageOr(membersResult.error.message, "Couldn't load members")
    );
  }
  if (invitationsResult.error) {
    throw new Error(
      messageOr(invitationsResult.error.message, "Couldn't load invitations")
    );
  }
  const members = membersResult.data?.members ?? EMPTY_MEMBERS;
  const invitations = (invitationsResult.data ?? EMPTY_INVITATIONS).filter(
    (row) => row.status === "pending"
  );
  return {
    members: members as OrgMember[],
    invitations: invitations as OrgInvitation[],
  };
}

export function OrganizationMembers() {
  const queryClient = useQueryClient();
  const { data: session } = useSession(authClient);
  const teamQuery = useQuery({
    queryKey: TEAM_QUERY_KEY,
    queryFn: loadTeam,
    placeholderData: placeholderDataForQueryKey(TEAM_QUERY_KEY),
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(0);

  const selfId = session?.user.id;
  const selfMember = teamQuery.data?.members.find(
    (member) => member.userId === selfId
  );
  const manage = canManageTeam(selfMember?.role ?? "");
  const selfIsOwner = hasRole(selfMember?.role ?? "", "owner");

  const invalidate = async () =>
    queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });

  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.inviteMember({
        email,
        role,
      });
      if (error)
        throw new Error(messageOr(error.message, "Couldn't send invitation"));
    },
    onSuccess: async () => {
      setEmail("");
      toast.success(
        "Invitation created. Copy the link if mail is not configured."
      );
      await invalidate();
    },
    onError: (error) => {
      toast.error(errMessage(error, "Couldn't send invitation"));
    },
  });

  const cancelInvite = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await authClient.organization.cancelInvitation({
        invitationId,
      });
      if (error)
        throw new Error(messageOr(error.message, "Couldn't cancel invitation"));
    },
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(errMessage(error, "Couldn't cancel invitation"));
    },
  });

  const resendInvite = useMutation({
    mutationFn: async (row: OrgInvitation) => {
      const { error } = await authClient.organization.inviteMember({
        email: row.email,
        role: row.role === "admin" ? "admin" : "member",
        resend: true,
      });
      if (error)
        throw new Error(messageOr(error.message, "Couldn't resend invitation"));
    },
    onSuccess: async () => {
      toast.success("Invitation sent again.");
      await invalidate();
    },
    onError: (error) => {
      toast.error(errMessage(error, "Couldn't resend invitation"));
    },
  });

  const updateRole = useMutation({
    mutationFn: async (input: { memberId: string; role: string }) => {
      const { error } = await authClient.organization.updateMemberRole(input);
      if (error)
        throw new Error(messageOr(error.message, "Couldn't update role"));
    },
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(errMessage(error, "Couldn't update role"));
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberIdOrEmail: string) => {
      const { error } = await authClient.organization.removeMember({
        memberIdOrEmail,
      });
      if (error)
        throw new Error(messageOr(error.message, "Couldn't remove member"));
    },
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(errMessage(error, "Couldn't remove member"));
    },
  });

  const teamPending = listPending(teamQuery);
  const teamLoadError = queryLoadError(
    teamQuery,
    teamPending,
    "Couldn't load team"
  );

  if (teamPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (teamLoadError !== null) {
    return (
      <FetchErrorAlert
        error={teamLoadError}
        onRetry={() => {
          void teamQuery.refetch();
        }}
      />
    );
  }

  const members = teamQuery.data?.members ?? EMPTY_MEMBERS;
  const invitations = teamQuery.data?.invitations ?? EMPTY_INVITATIONS;
  const visibleMembers = members.filter((member) =>
    memberMatches(member, search, roleFilter)
  );
  const pageCount = Math.max(1, Math.ceil(visibleMembers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageMembers = visibleMembers.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  return (
    <div
      className={cn(
        "max-w-2xl space-y-6",
        placeholderDeemphasisClass(teamQuery.isPlaceholderData)
      )}
    >
      {manage ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            invite.mutate();
          }}
        >
          <FormSection
            title="Invite someone"
            description="Send an invitation by email. If mail isn't set up, copy the link from Pending invitations."
            footer={
              <Button type="submit" size="sm" disabled={invite.isPending}>
                {invite.isPending ? <Spinner /> : null}
                Invite
              </Button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <Field>
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                  required
                  autoComplete="off"
                />
              </Field>
              <Field>
                <Label htmlFor="invite-role">Role</Label>
                <FieldSelect
                  id="invite-role"
                  value={role}
                  onValueChange={(next) => {
                    if (next === "member" || next === "admin") setRole(next);
                  }}
                  options={[...INVITE_ROLE_OPTIONS]}
                />
              </Field>
            </div>
          </FormSection>
        </form>
      ) : null}

      <FormSection>
        {members.length > 1 ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
            <Input
              aria-label="Search members"
              type="search"
              placeholder="Search by name or email"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
            <FieldSelect
              aria-label="Filter by role"
              value={roleFilter}
              onValueChange={(next) => {
                setRoleFilter(next);
                setPage(0);
              }}
              options={[...ROLE_FILTER_OPTIONS]}
            />
          </div>
        ) : null}
        <ul className="divide-y">
          {pageMembers.map((member) => (
            <li
              key={member.id}
              className="group flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {trimmedOrUndefined(member.user?.name) ??
                    trimmedOrUndefined(member.user?.email) ??
                    member.userId}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {member.user?.email} · {member.role}
                </p>
              </div>
              {manage && member.userId !== selfId && member.role !== "owner" ? (
                <RowActionsMenu
                  label={`Actions for ${member.user?.email ?? member.id}`}
                >
                  {selfIsOwner ? (
                    <DropdownMenuItem
                      onClick={() => {
                        updateRole.mutate({
                          memberId: member.id,
                          role: "owner",
                        });
                      }}
                    >
                      Make owner
                    </DropdownMenuItem>
                  ) : null}
                  {member.role === "member" ? (
                    <DropdownMenuItem
                      onClick={() => {
                        updateRole.mutate({
                          memberId: member.id,
                          role: "admin",
                        });
                      }}
                    >
                      Make admin
                    </DropdownMenuItem>
                  ) : null}
                  {member.role === "admin" ? (
                    <DropdownMenuItem
                      onClick={() => {
                        updateRole.mutate({
                          memberId: member.id,
                          role: "member",
                        });
                      }}
                    >
                      Make member
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      removeMember.mutate(member.id);
                    }}
                  >
                    Remove
                  </DropdownMenuItem>
                </RowActionsMenu>
              ) : null}
            </li>
          ))}
        </ul>
        {visibleMembers.length === 0 ? (
          <p className="text-muted-foreground text-sm">No matching members.</p>
        ) : null}
        {visibleMembers.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-muted-foreground text-xs">
              {currentPage * PAGE_SIZE + 1}–
              {Math.min((currentPage + 1) * PAGE_SIZE, visibleMembers.length)}{" "}
              of {visibleMembers.length}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage === 0}
                onClick={() => {
                  setPage(currentPage - 1);
                }}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage >= pageCount - 1}
                onClick={() => {
                  setPage(currentPage + 1);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </FormSection>

      <FormSection title="Pending invitations">
        {invitations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No pending invitations.
          </p>
        ) : (
          <ul className="divide-y">
            {invitations.map((row) => {
              const url = invitationAcceptUrl(row.id);
              return (
                <li
                  key={row.id}
                  className="group flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{row.email}</p>
                    <p className="text-muted-foreground text-xs">{row.role}</p>
                  </div>
                  {manage ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-accept-url={url}
                        onClick={() => {
                          void copyInviteLink(url);
                        }}
                      >
                        Copy link
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={resendInvite.isPending}
                        onClick={() => {
                          resendInvite.mutate(row);
                        }}
                      >
                        Resend
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          cancelInvite.mutate(row.id);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </FormSection>
    </div>
  );
}
