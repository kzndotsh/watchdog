import {
  BriefcaseIcon,
  CheckSquareIcon,
  GitForkIcon,
  HashIcon,
  InboxIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  ShapesIcon,
  UploadIcon,
  type LucideIcon,
} from "lucide-react";

import { CASE_NAV_ITEMS, NAV_GROUPS, type NavTo } from "@/config/nav";

export interface JumpNavItem {
  to: NavTo | "/";
  label: string;
  icon: LucideIcon;
}

const JUMP_ICONS: Partial<Record<NavTo | "/", LucideIcon>> = {
  "/": LayoutDashboardIcon,
  "/entities": ShapesIcon,
  "/identifiers": HashIcon,
  "/graph": GitForkIcon,
  "/tasks": CheckSquareIcon,
  "/collect": UploadIcon,
  "/triage": InboxIcon,
  "/cases": BriefcaseIcon,
  "/settings": SettingsIcon,
};

/** Idle palette destinations (excludes Dev / UI kit). */
export function jumpNavItems(): JumpNavItem[] {
  const seen = new Set<string>();
  const items: JumpNavItem[] = [];

  function push(to: NavTo | "/", label: string, icon?: LucideIcon) {
    if (seen.has(to)) return;
    seen.add(to);
    const resolved = icon ?? JUMP_ICONS[to];
    if (!resolved) return;
    items.push({ to, label, icon: resolved });
  }

  push("/", "Dashboard", LayoutDashboardIcon);
  for (const item of CASE_NAV_ITEMS) {
    push(item.to, item.label, item.icon);
  }
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.to === "/ui") continue;
      push(item.to, item.label, item.icon);
    }
  }
  return items;
}
