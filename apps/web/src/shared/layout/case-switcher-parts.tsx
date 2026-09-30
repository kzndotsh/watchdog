import { Link, useRouterState } from "@tanstack/react-router";
import { CheckIcon, LayoutDashboardIcon } from "lucide-react";

import { CASE_NAV_ITEMS, pathActive } from "@/config/nav";
import type { CaseRecord } from "@/domains/cases/types";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@watchdog/ui/components/dropdown-menu";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@watchdog/ui/components/sidebar";

export function CaseNavLinks({
  caseSlug,
  collapsed,
}: {
  caseSlug: string | undefined;
  collapsed: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const overviewActive =
    caseSlug !== undefined &&
    (pathname === `/cases/${caseSlug}` ||
      pathname.startsWith(`/cases/${caseSlug}/`));

  if (collapsed || !caseSlug) return null;

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={overviewActive}
          tooltip="Overview"
          render={<Link to="/cases/$caseSlug" params={{ caseSlug }} />}
        >
          <LayoutDashboardIcon />
          <span>Overview</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {CASE_NAV_ITEMS.map((item) => {
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
    </>
  );
}

export function CasePickerItems({
  cases,
  activeId,
  onSelect,
}: {
  cases: CaseRecord[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Cases</DropdownMenuLabel>
      {cases.map((c) => {
        const selected = c.id === activeId;
        return (
          <DropdownMenuItem
            key={c.id}
            onClick={() => {
              onSelect(c.id);
            }}
          >
            <span className="truncate">{c.name}</span>
            {selected ? <CheckIcon className="ml-auto" /> : null}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  );
}
