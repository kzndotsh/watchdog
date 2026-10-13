import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboardIcon } from "lucide-react";

import { CASE_NAV_ITEMS, pathActive } from "@/config/nav";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@watchdog/ui/components/sidebar";

export function CaseNavLinks({
  caseSlug,
  isCollapsed,
}: {
  caseSlug: string | undefined;
  isCollapsed: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const overviewActive =
    caseSlug !== undefined &&
    (pathname === `/cases/${caseSlug}` ||
      pathname.startsWith(`/cases/${caseSlug}/`));

  if (isCollapsed || !caseSlug) return null;

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
