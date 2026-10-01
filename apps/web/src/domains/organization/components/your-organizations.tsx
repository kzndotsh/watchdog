import { useSession } from "@better-auth-ui/react";
import {
  useListOrganizations,
  useSetActiveOrganization,
} from "@better-auth-ui/react/plugins/organization";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { authClient } from "@/auth/client";
import { CreateOrganizationForm } from "@/domains/organization/components/create-organization-form";
import { OrgAvatar } from "@/domains/organization/components/org-avatar";
import { reloadIntoOrganization } from "@/domains/organization/lib/switch-organization";
import { errMessage, messageOr } from "@/lib/utils";
import { FormSection } from "@/shared/ui/form-section";
import { Button } from "@/shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";
import { toast } from "@/shared/ui/toast";
import { Spinner } from "@watchdog/ui/components/spinner";

interface UserInvitation {
  id: string;
  organizationId: string;
  organizationName?: string | null;
  role: string;
  status: string;
}

const INVITATIONS_KEY = ["auth-org", "user-invitations"] as const;

async function loadUserInvitations(): Promise<UserInvitation[]> {
  const { data, error } = await authClient.organization.listUserInvitations();
  if (error) {
    throw new Error(messageOr(error.message, "Couldn't load invitations"));
  }
  return (data as UserInvitation[]).filter((row) => row.status === "pending");
}

/** Every organization you belong to, plus invitations addressed to you. */
export function YourOrganizations() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: session } = useSession(authClient);
  const { data: organizations, isPending } = useListOrganizations(authClient);
  const setActive = useSetActiveOrganization(authClient);
  const invitations = useQuery({
    queryKey: INVITATIONS_KEY,
    queryFn: loadUserInvitations,
  });
  const activeId = session?.session.activeOrganizationId ?? null;

  const accept = useMutation({
    mutationFn: async (invitation: UserInvitation) => {
      const { error } = await authClient.organization.acceptInvitation({
        invitationId: invitation.id,
      });
      if (error) {
        throw new Error(messageOr(error.message, "Couldn't accept"));
      }
      return invitation.organizationId;
    },
    onSuccess: (organizationId) => {
      setActive.mutate(
        { organizationId },
        { onSuccess: reloadIntoOrganization }
      );
    },
    onError: (error) => {
      toast.error(errMessage(error, "Couldn't accept the invitation"));
    },
  });

  const reject = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await authClient.organization.rejectInvitation({
        invitationId,
      });
      if (error) {
        throw new Error(messageOr(error.message, "Couldn't decline"));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
    },
    onError: (error) => {
      toast.error(errMessage(error, "Couldn't decline the invitation"));
    },
  });

  if (isPending && !organizations) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const pendingInvitations = invitations.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <FormSection
        footer={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            <PlusIcon />
            Create organization
          </Button>
        }
      >
        <ul className="divide-y">
          {(organizations ?? []).map((org) => (
            <li
              key={org.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <OrgAvatar name={org.name} logo={org.logo} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{org.name}</p>
                  <p className="text-muted-foreground truncate font-mono text-xs">
                    {org.slug}
                  </p>
                </div>
              </div>
              {org.id === activeId ? (
                <span className="text-muted-foreground shrink-0 text-xs">
                  Active
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  loading={setActive.isPending}
                  onClick={() => {
                    setActive.mutate(
                      { organizationId: org.id },
                      { onSuccess: reloadIntoOrganization }
                    );
                  }}
                >
                  Switch
                </Button>
              )}
            </li>
          ))}
        </ul>
      </FormSection>

      <FormSection title="Invitations">
        {pendingInvitations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No pending invitations.
          </p>
        ) : (
          <ul className="divide-y">
            {pendingInvitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {invitation.organizationName ?? "An organization"}
                  </p>
                  <p className="text-muted-foreground text-xs capitalize">
                    {invitation.role}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    loading={accept.isPending}
                    onClick={() => {
                      accept.mutate(invitation);
                    }}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={reject.isPending}
                    onClick={() => {
                      reject.mutate(invitation.id);
                    }}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>
              A separate workspace with its own Cases, members, and API keys.
              You become its owner.
            </DialogDescription>
          </DialogHeader>
          <CreateOrganizationForm onCreated={reloadIntoOrganization} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
