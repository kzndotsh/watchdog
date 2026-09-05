"use client";

import { useSession } from "@better-auth-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/auth/client";
import { buildInvitationAcceptUrl, invitationAcceptPath } from "@/auth/invitation-url";
import { canManageTeam, INVITE_ROLE_OPTIONS } from "@/auth/org-roles";
import { errMessage } from "@/lib/utils";
import { FieldSelect } from "@/shared/ui/field-select";
import { FormSection } from "@/shared/ui/form-section";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { Button } from "@/shared/ui/shadcn/button";
import { DropdownMenuItem } from "@/shared/ui/shadcn/dropdown-menu";
import { Field } from "@/shared/ui/shadcn/field";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { Spinner } from "@/shared/ui/shadcn/spinner";

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

const TEAM_QUERY_KEY = ["auth-org", "team"] as const;

function invitationAcceptUrl(invitationId: string): string {
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;
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
    throw new Error(membersResult.error.message || "Could not load members");
  }
  if (invitationsResult.error) {
    throw new Error(
      invitationsResult.error.message || "Could not load invitations"
    );
  }
  const members = membersResult.data?.members ?? [];
  const invitations = (invitationsResult.data ?? []).filter(
    (row) => row.status === "pending"
  );
  return { members: members as OrgMember[], invitations: invitations as OrgInvitation[] };
}

export function TeamSettings() {
  const queryClient = useQueryClient();
  const { data: session } = useSession(authClient);
  const teamQuery = useQuery({
    queryKey: TEAM_QUERY_KEY,
    queryFn: loadTeam,
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");

  const selfId = session?.user.id;
  const selfMember = teamQuery.data?.members.find(
    (member) => member.userId === selfId
  );
  const manage = canManageTeam(selfMember?.role ?? "");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });

  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.inviteMember({
        email,
        role,
      });
      if (error) throw new Error(error.message || "Could not send invitation");
    },
    onSuccess: async () => {
      setEmail("");
      toast.success("Invitation created. Copy the link if mail is not configured.");
      await invalidate();
    },
    onError: (error) => {
      toast.error(errMessage(error, "Could not send invitation"));
    },
  });

  const cancelInvite = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await authClient.organization.cancelInvitation({
        invitationId,
      });
      if (error) throw new Error(error.message || "Could not cancel invitation");
    },
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(errMessage(error, "Could not cancel invitation"));
    },
  });

  const updateRole = useMutation({
    mutationFn: async (input: { memberId: string; role: string }) => {
      const { error } = await authClient.organization.updateMemberRole(input);
      if (error) throw new Error(error.message || "Could not update role");
    },
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(errMessage(error, "Could not update role"));
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberIdOrEmail: string) => {
      const { error } = await authClient.organization.removeMember({
        memberIdOrEmail,
      });
      if (error) throw new Error(error.message || "Could not remove member");
    },
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(errMessage(error, "Could not remove member"));
    },
  });

  if (teamQuery.isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (teamQuery.error) {
    return (
      <p className="text-destructive text-sm">
        {errMessage(teamQuery.error, "Could not load team")}
      </p>
    );
  }

  const members = teamQuery.data?.members ?? [];
  const invitations = teamQuery.data?.invitations ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      {manage ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            invite.mutate();
          }}
        >
          <FormSection
            title="Invite"
            description="Public sign-up stays closed. Share the invitation link if SMTP is not set."
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

      <FormSection title="Members" description="Organization membership, not Case membership.">
        <ul className="divide-y">
          {members.map((member) => (
            <li
              key={member.id}
              className="group flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {member.user?.name || member.user?.email || member.userId}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {member.user?.email} · {member.role}
                </p>
              </div>
              {manage && member.userId !== selfId && member.role !== "owner" ? (
                <RowActionsMenu label={`Actions for ${member.user?.email ?? member.id}`}>
                  {member.role === "member" ? (
                    <DropdownMenuItem
                      onClick={() => {
                        updateRole.mutate({ memberId: member.id, role: "admin" });
                      }}
                    >
                      Make admin
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
      </FormSection>

      <FormSection
        title="Pending invitations"
        description="Copy the link when mail is not configured."
      >
        {invitations.length === 0 ? (
          <p className="text-muted-foreground text-sm">No pending invitations.</p>
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
                    <p className="truncate text-sm font-medium">{row.email}</p>
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
                          void navigator.clipboard.writeText(url).then(
                            () => {
                              toast.success("Invitation link copied");
                            },
                            (error) => {
                              toast.error(errMessage(error, "Copy failed"));
                            }
                          );
                        }}
                      >
                        Copy link
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
