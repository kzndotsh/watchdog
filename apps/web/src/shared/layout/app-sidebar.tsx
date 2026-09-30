import { useSession } from "@better-auth-ui/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { DogIcon, LogOutIcon, SettingsIcon } from "lucide-react";

import { authClient } from "@/auth/client";
import { NAV_GROUPS, pathActive } from "@/config/nav";
import { OrgSwitcher } from "@/domains/organization/components/org-switcher";
import { CommandSearchTrigger } from "@/domains/search/components/command-search-trigger";
import { CaseSwitcher } from "@/shared/layout/case-switcher";
import { modeLabel, useThemeMode } from "@/shared/layout/theme-toggle";
import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/timestamp";
import { trimmedOrUndefined } from "@watchdog/schemas";
import { Avatar, AvatarFallback } from "@watchdog/ui/components/avatar";
import { ScrollArea } from "@watchdog/ui/components/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@watchdog/ui/components/sidebar";
import { Skeleton } from "@watchdog/ui/components/skeleton";

function userDisplayName(user: {
  name?: string | null;
  email?: string | null;
}) {
  return (
    trimmedOrUndefined(user.name) ??
    trimmedOrUndefined(user.email) ??
    "Investigator"
  );
}

function userInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function AccountStripSkeleton() {
  return (
    <div className="flex items-center gap-1 px-1">
      <Skeleton className="size-6 rounded-full" />
    </div>
  );
}

/** Account controls as a strip: who you are, theme, settings, sign out. Icon mode keeps avatar + settings. */
function AccountStrip() {
  const { data, isPending } = useSession(authClient);
  const { mode, toggleMode, Icon: ThemeIcon, ariaLabel } = useThemeMode();
  const user = data?.user;
  const name = user ? userDisplayName(user) : "Investigator";
  const email = user?.email ?? "";

  if (isPending && !user) {
    return <AccountStripSkeleton />;
  }

  return (
    <div className="flex items-center gap-1 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
      <WithTooltip
        side="right"
        content={
          <span className="flex flex-col">
            <span className="font-medium">{name}</span>
            {email ? <span className="opacity-80">{email}</span> : null}
          </span>
        }
      >
        <Avatar size="sm" aria-label={name}>
          <AvatarFallback className="text-xs" suppressHydrationWarning>
            {userInitials(name) || "?"}
          </AvatarFallback>
        </Avatar>
      </WithTooltip>

      <span className="flex-1 group-data-[collapsible=icon]:hidden" />

      <WithTooltip content={`Theme: ${modeLabel(mode)}`}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={ariaLabel}
          onClick={toggleMode}
          className="text-sidebar-foreground group-data-[collapsible=icon]:hidden"
        >
          <ThemeIcon />
        </Button>
      </WithTooltip>
      <WithTooltip content="Settings" side="right">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Settings"
          nativeButton={false}
          render={<Link to="/settings" />}
          className="text-sidebar-foreground"
        >
          <SettingsIcon />
        </Button>
      </WithTooltip>
      <WithTooltip content="Sign out">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Sign out"
          nativeButton={false}
          render={<Link to="/auth/$path" params={{ path: "sign-out" }} />}
          className="text-sidebar-foreground group-data-[collapsible=icon]:hidden"
        >
          <LogOutIcon />
        </Button>
      </WithTooltip>
    </div>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pb-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="default"
              isActive={pathActive(pathname, "/")}
              render={<Link to="/" />}
              tooltip="Dashboard"
              className="h-9 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2! [&_svg]:size-4"
            >
              <DogIcon className="shrink-0" />
              <span className="font-heading tracking-eyebrow-sm text-sm font-medium group-data-[collapsible=icon]:hidden">
                WATCHDOG
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <CommandSearchTrigger />
        </SidebarGroup>
        <SidebarGroup>
          <CaseSwitcher />
        </SidebarGroup>
        <ScrollArea className="h-full">
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          isActive={pathActive(pathname, item.to)}
                          tooltip={item.label}
                          render={<Link to={item.to} />}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter>
        <OrgSwitcher />
        <SidebarSeparator />
        <AccountStrip />
      </SidebarFooter>
    </Sidebar>
  );
}
