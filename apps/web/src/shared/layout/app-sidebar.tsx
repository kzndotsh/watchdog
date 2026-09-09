import { useSession } from "@better-auth-ui/react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ChevronsUpDownIcon,
  DogIcon,
  LogOutIcon,
  SettingsIcon,
} from "lucide-react";

import { authClient } from "@/auth/client";
import { NAV_GROUPS, pathActive } from "@/config/nav";
import { CommandSearchTrigger } from "@/domains/search/components/command-search-trigger";
import { CaseSwitcher } from "@/shared/layout/case-switcher";
import { ThemeMenuItem } from "@/shared/layout/theme-toggle";
import { Avatar, AvatarFallback } from "@/shared/ui/shadcn/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/shadcn/dropdown-menu";
import { ScrollArea } from "@/shared/ui/shadcn/scroll-area";
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
} from "@/shared/ui/shadcn/sidebar";
import { Skeleton } from "@/shared/ui/shadcn/skeleton";
import { trimmedOrUndefined } from "@watchdog/schemas";

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

function NavUserSkeleton() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          className="pointer-events-none border-0 bg-transparent shadow-none"
        >
          <Skeleton className="size-8 rounded-full" />
          <div className="grid flex-1 gap-1.5 text-left">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavUser() {
  const navigate = useNavigate();
  const { data, isPending } = useSession(authClient);
  const user = data?.user;
  const name = user ? userDisplayName(user) : "Investigator";
  const email = user?.email ?? "";
  const initials = userInitials(name);

  if (isPending && !user) {
    return <NavUserSkeleton />;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="hover:bg-sidebar-accent data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground border-0 bg-transparent shadow-none"
              />
            }
          >
            <Avatar size="sm">
              <AvatarFallback className="text-xs" suppressHydrationWarning>
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium" suppressHydrationWarning>
                {name}
              </span>
              {email ? (
                <span
                  className="text-muted-foreground truncate text-sm"
                  suppressHydrationWarning
                >
                  {email}
                </span>
              ) : null}
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side="top"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="truncate font-medium">{name}</span>
                  {email ? (
                    <span className="text-muted-foreground truncate text-sm">
                      {email}
                    </span>
                  ) : null}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <ThemeMenuItem />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => void navigate({ to: "/settings" })}
              >
                <SettingsIcon />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  void navigate({
                    to: "/auth/$path",
                    params: { path: "sign-out" },
                  });
                }}
              >
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
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
              <span className="font-heading text-sm font-medium tracking-[0.12em] group-data-[collapsible=icon]:hidden">
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
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
