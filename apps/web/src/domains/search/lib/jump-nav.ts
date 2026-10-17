import { LayoutDashboardIcon, type LucideIcon } from "lucide-react";

import {
  CASE_NAV_ITEMS,
  NAV_GROUPS,
  type NavTo,
  type WorkScreen,
} from "@/config/nav";

/** A Case-less destination or a Work screen (which needs the Active Case's slug). */
export type JumpNavItem = { label: string; icon: LucideIcon } & (
  | { to: NavTo; screen?: undefined }
  | { screen: WorkScreen; to?: undefined }
);

/** Idle command-palette destinations, in sidebar order. */
export function jumpNavItems(): JumpNavItem[] {
  const items: JumpNavItem[] = [
    { to: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  ];
  for (const item of CASE_NAV_ITEMS) {
    items.push({ screen: item.screen, label: item.label, icon: item.icon });
  }
  for (const group of NAV_GROUPS) {
    if (group.kind === "work") {
      for (const item of group.items) {
        items.push({ screen: item.screen, label: item.label, icon: item.icon });
      }
    } else {
      for (const item of group.items) {
        items.push({ to: item.to, label: item.label, icon: item.icon });
      }
    }
  }
  return items;
}
