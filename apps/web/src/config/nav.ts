/** Sidebar nav — Case is app state, not in the URL. */

import type { LucideIcon } from "lucide-react";
import {
  BriefcaseIcon,
  CheckSquareIcon,
  GitForkIcon,
  HashIcon,
  InboxIcon,
  PaletteIcon,
  SettingsIcon,
  ShapesIcon,
  UploadIcon,
} from "lucide-react";

export type NavTo =
  | "/"
  | "/cases"
  | "/entities"
  | "/identifiers"
  | "/graph"
  | "/collect"
  | "/triage"
  | "/tasks"
  | "/settings"
  | "/ui";

export interface NavItem {
  to: NavTo;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Active-Case graph nouns — rendered with the Case switcher (flat), not in NAV_GROUPS. */
export const CASE_NAV_ITEMS: NavItem[] = [
  { to: "/entities", label: "Entities", icon: ShapesIcon },
  { to: "/identifiers", label: "Identifiers", icon: HashIcon },
  { to: "/graph", label: "Graph", icon: GitForkIcon },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Work",
    items: [
      { to: "/tasks", label: "Tasks", icon: CheckSquareIcon },
      { to: "/collect", label: "Collect", icon: UploadIcon },
      { to: "/triage", label: "Triage", icon: InboxIcon },
    ],
  },
  {
    label: "Manage",
    items: [{ to: "/cases", label: "Cases", icon: BriefcaseIcon }],
  },
  {
    label: "Config",
    items: [{ to: "/settings", label: "Settings", icon: SettingsIcon }],
  },
  {
    label: "Dev",
    items: [{ to: "/ui", label: "UI kit", icon: PaletteIcon }],
  },
];

export function pathActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}
