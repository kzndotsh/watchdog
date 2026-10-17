import { Link, useMatchRoute } from "@tanstack/react-router";
import { LayoutDashboardIcon } from "lucide-react";

import { CASE_NAV_ITEMS, WORK_TO } from "@/config/nav";
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
  const matchRoute = useMatchRoute();

  if (isCollapsed || !caseSlug) return null;

  const params = { caseSlug };
  const isOverviewActive =
    matchRoute({ to: "/cases/$caseSlug", params }) !== false;

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isOverviewActive}
          tooltip="Overview"
          render={<Link to="/cases/$caseSlug" params={params} />}
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
              isActive={
                matchRoute({
                  to: WORK_TO[item.screen],
                  params,
                  fuzzy: true,
                }) !== false
              }
              tooltip={item.label}
              render={<Link to={WORK_TO[item.screen]} params={params} />}
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
