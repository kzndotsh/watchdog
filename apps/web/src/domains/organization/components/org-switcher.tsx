import { useSession } from "@better-auth-ui/react";
import {
  useListOrganizations,
  useSetActiveOrganization,
} from "@better-auth-ui/react/plugins/organization";
import {
  UsersRoundIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";

import { authClient } from "@/auth/client";
import { CreateOrganizationForm } from "@/domains/organization/components/create-organization-form";
import { reloadIntoOrganization } from "@/domains/organization/lib/switch-organization";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@watchdog/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@watchdog/ui/components/sidebar";

/** Sidebar control for the active organization: switch, or create another. */
export function OrgSwitcher() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: sessionData } = useSession(authClient);
  const { data: organizations, isPending } = useListOrganizations(authClient);
  const setActive = useSetActiveOrganization(authClient);

  const activeId = sessionData?.session.activeOrganizationId ?? null;
  const active =
    organizations?.find((org) => org.id === activeId) ?? organizations?.[0];

  if (isPending && !organizations) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton disabled tooltip="Organization">
            <UsersRoundIcon />
            <span className="truncate">Organization</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton tooltip={active?.name ?? "Organization"} />
              }
            >
              <UsersRoundIcon />
              <span className="truncate">{active?.name ?? "Organization"}</span>
              <ChevronsUpDownIcon className="ml-auto" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56"
              side="top"
              align="start"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                {(organizations ?? []).map((org) => (
                  <DropdownMenuItem
                    key={org.id}
                    disabled={setActive.isPending}
                    onClick={() => {
                      if (org.id === active?.id) return;
                      setActive.mutate(
                        { organizationId: org.id },
                        { onSuccess: reloadIntoOrganization }
                      );
                    }}
                  >
                    <span className="truncate">{org.name}</span>
                    {org.id === active?.id ? (
                      <CheckIcon className="ml-auto" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setCreateOpen(true);
                }}
              >
                <PlusIcon />
                Create organization
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

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
    </>
  );
}
