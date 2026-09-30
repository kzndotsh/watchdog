import { Link } from "@tanstack/react-router";
import {
  ChevronsUpDownIcon,
  FolderIcon,
  LayoutDashboardIcon,
  PlusIcon,
} from "lucide-react";

import { CASE_NAV_ITEMS } from "@/config/nav";
import type { CaseRecord } from "@/domains/cases/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@watchdog/ui/components/dropdown-menu";
import {
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@watchdog/ui/components/sidebar";

import { CaseNavLinks, CasePickerItems } from "./case-switcher-parts";

export function CaseSwitcherEmpty({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Create a Case"
            render={<Link to="/cases" />}
          >
            <PlusIcon />
            <span>Create a case…</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <>
      <SidebarGroupLabel>Case</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton render={<Link to="/cases" />}>
            <PlusIcon />
            <span>Create a case…</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}

export function CaseSwitcherCollapsed({
  cases,
  active,
  activeId,
  onSelectCase,
}: {
  cases: CaseRecord[];
  active: CaseRecord | null | undefined;
  activeId: string;
  onSelectCase: (id: string) => void;
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                tooltip={active?.name ?? "Case"}
                className="dark:bg-input/30 data-open:bg-sidebar-accent dark:data-open:bg-input/50 data-open:text-sidebar-accent-foreground bg-transparent"
              />
            }
          >
            <FolderIcon />
            <span>{active?.name ?? "Case"}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-48"
            side="right"
            align="end"
            sideOffset={8}
          >
            <CasePickerItems
              cases={cases}
              activeId={activeId}
              onSelect={onSelectCase}
            />
            {active ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  render={
                    <Link
                      to="/cases/$caseSlug"
                      params={{ caseSlug: active.slug }}
                    />
                  }
                >
                  <LayoutDashboardIcon />
                  Overview
                </DropdownMenuItem>
                {CASE_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.to}
                      render={<Link to={item.to} />}
                    >
                      <Icon />
                      {item.label}
                    </DropdownMenuItem>
                  );
                })}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function CaseSwitcherExpanded({
  cases,
  active,
  activeId,
  collapsed,
  onSelectCase,
}: {
  cases: CaseRecord[];
  active: CaseRecord | null | undefined;
  activeId: string;
  collapsed: boolean;
  onSelectCase: (id: string) => void;
}) {
  return (
    <>
      <SidebarGroupLabel>Case</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  aria-label="Active case"
                  tooltip={active?.name ?? "Case"}
                  className="dark:bg-input/30 data-popup-open:bg-input/30 data-popup-open:text-sidebar-accent-foreground h-8 bg-transparent data-popup-open:!rounded-b-none"
                />
              }
            >
              <FolderIcon />
              <span className="truncate">{active?.name ?? "Select case…"}</span>
              <ChevronsUpDownIcon className="ml-auto size-3.5 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="bg-sidebar w-(--anchor-width) min-w-0 overflow-hidden !rounded-t-none rounded-b-md p-0 shadow-none ring-0"
              side="bottom"
              align="start"
              sideOffset={0}
            >
              <div className="bg-input/30 p-1">
                <CasePickerItems
                  cases={cases}
                  activeId={activeId}
                  onSelect={onSelectCase}
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
        <CaseNavLinks caseSlug={active?.slug} collapsed={collapsed} />
      </SidebarMenu>
    </>
  );
}
