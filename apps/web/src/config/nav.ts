/** Sidebar nav: Work screens live under the Case slug, the rest are Case-less. */

import type { LucideIcon } from "lucide-react";
import {
  BriefcaseIcon,
  CheckSquareIcon,
  GitForkIcon,
  HashIcon,
  InboxIcon,
  LibraryIcon,
  SettingsIcon,
  ShapesIcon,
  UploadIcon,
} from "lucide-react";

/** Work screen to its route: every one takes the `caseSlug` param. */
export const WORK_TO = {
  entities: "/cases/$caseSlug/entities",
  identifiers: "/cases/$caseSlug/identifiers",
  graph: "/cases/$caseSlug/graph",
  collect: "/cases/$caseSlug/collect",
  triage: "/cases/$caseSlug/triage",
  tasks: "/cases/$caseSlug/tasks",
} as const;

export type WorkScreen = keyof typeof WORK_TO;

/** Case-less destinations. */
export type NavTo = "/" | "/cases" | "/library" | "/settings";

export type NavItem = {
  to: NavTo;
  label: string;
  icon: LucideIcon;
};

export type WorkNavItem = {
  screen: WorkScreen;
  label: string;
  icon: LucideIcon;
};

export type NavGroup =
  | { kind: "work"; label: string; items: WorkNavItem[] }
  | { kind: "static"; label: string; items: NavItem[] };

/** Case graph nouns: rendered with the Case switcher (flat), not in NAV_GROUPS. */
export const CASE_NAV_ITEMS: WorkNavItem[] = [
  { screen: "entities", label: "Entities", icon: ShapesIcon },
  { screen: "identifiers", label: "Identifiers", icon: HashIcon },
  { screen: "graph", label: "Graph", icon: GitForkIcon },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    kind: "work",
    label: "Work",
    items: [
      { screen: "tasks", label: "Tasks", icon: CheckSquareIcon },
      { screen: "collect", label: "Collect", icon: UploadIcon },
      { screen: "triage", label: "Triage", icon: InboxIcon },
    ],
  },
  {
    kind: "static",
    label: "Manage",
    items: [
      { to: "/cases", label: "Cases", icon: BriefcaseIcon },
      { to: "/library", label: "Library", icon: LibraryIcon },
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

/** Link target for a Work screen: the Case's URL, or the Cases list while there is no Case. */
export type WorkHref =
  | { to: "/cases" }
  | { to: (typeof WORK_TO)[WorkScreen]; params: { caseSlug: string } };

export function workHref(
  screen: WorkScreen,
  caseSlug: string | undefined
): WorkHref {
  return caseSlug === undefined
    ? { to: "/cases" }
    : { to: WORK_TO[screen], params: { caseSlug } };
}

export function pathActive(pathname: string, to: string): boolean {
  // Every Work screen lives under `/cases/$caseSlug/...`, so "Cases" is the list only.
  if (to === "/" || to === "/cases") return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}
