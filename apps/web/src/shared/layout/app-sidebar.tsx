import { useSession } from "@better-auth-ui/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { DogIcon, LogOutIcon, SettingsIcon } from "lucide-react";

import { authClient } from "@/auth/client";
import { NAV_GROUPS, pathActive } from "@/config/nav";
import { OrgSwitcher } from "@/domains/organization/components/org-switcher";
import { SearchButton } from "@/domains/search/components/search-button";
import { CaseSwitcher } from "@/shared/layout/case-switcher";
import { modeLabel, useThemeMode } from "@/shared/layout/theme-toggle";
import { WithTooltip } from "@/shared/ui/timestamp";
import { trimmedOrUndefined } from "@watchdog/schemas";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@watchdog/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@watchdog/ui/components/dropdown-menu";
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

function AccountRowSkeleton() {
  return (
    <div className="flex items-center gap-2 px-2">
      <Skeleton className="size-6 rounded-full" />
      <Skeleton className="h-3.5 w-24" />
    </div>
  );
}

/** Slim footer row: the account menu (name, theme, sign out) plus a settings shortcut. */
function AccountRow() {
  const { data, isPending } = useSession(authClient);
  const { mode, toggleMode, Icon: ThemeIcon, ariaLabel } = useThemeMode();
  const user = data?.user;
  const name = user ? userDisplayName(user) : "Investigator";
  const email = user?.email ?? "";

  if (isPending && !user) {
    return <AccountRowSkeleton />;
  }

  return (
    <div className="flex items-center group-data-[collapsible=icon]:flex-col">
      <SidebarMenu className="min-w-0 flex-1">
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton aria-label="Account menu" tooltip={name} />
              }
            >
              {/* Bigger than the 18px nav icons, but centered on their column (negative margins) so the text edge still lines up */}
              <Avatar size="sm" className="-mx-0.5 data-[size=sm]:size-5">
                {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
                <AvatarFallback className="text-xs" suppressHydrationWarning>
                  {userInitials(name).slice(0, 1) || "?"}
                </AvatarFallback>
              </Avatar>
              <span className="truncate" suppressHydrationWarning>
                {name}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56"
              side="top"
              align="start"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate font-medium">{name}</span>
                    {email ? (
                      <span className="text-muted-foreground truncate">
                        {email}
                      </span>
                    ) : null}
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  closeOnClick={false}
                  aria-label={ariaLabel}
                  onClick={toggleMode}
                >
                  <ThemeIcon />
                  {modeLabel(mode)}
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={
                    <Link to="/auth/$path" params={{ path: "sign-out" }} />
                  }
                >
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <SearchButton />

      <SidebarMenu className="w-auto">
        <SidebarMenuItem>
          <WithTooltip content="Settings" side="right" wrapSpan>
            <SidebarMenuButton
              aria-label="Settings"
              className="w-8 justify-center [&_svg]:size-3.5"
              render={<Link to="/settings" />}
            >
              <SettingsIcon />
            </SidebarMenuButton>
          </WithTooltip>
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon">
      {/* Same height as the page header (44px + its 1px border), logo and wordmark centered on its line */}
      <SidebarHeader className="border-sidebar-border box-content h-10 justify-center border-b p-0 px-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathActive(pathname, "/")}
              render={<Link to="/" />}
              tooltip="Dashboard"
              className="group-data-[collapsible=icon]:justify-center [&_svg]:size-4"
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

      <SidebarFooter className="gap-1">
        <OrgSwitcher />
        <AccountRow />
      </SidebarFooter>
    </Sidebar>
  );
}
