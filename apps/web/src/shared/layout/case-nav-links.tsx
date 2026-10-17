import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboardIcon } from "lucide-react";

import { CASE_NAV_ITEMS, WORK_TO, workPathActive } from "@/config/nav";
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
    (pathname === `/cases/${caseSlug}` || pathname === `/cases/${caseSlug}/`);

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
          <SidebarMenuItem key={item.screen}>
            <SidebarMenuButton
              isActive={workPathActive(pathname, item.screen)}
              tooltip={item.label}
              render={<Link to={WORK_TO[item.screen]} params={{ caseSlug }} />}
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
