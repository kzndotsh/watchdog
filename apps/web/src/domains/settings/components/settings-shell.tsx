/* oxlint-disable react/only-export-components, react-doctor/only-export-components -- shell + tab constants */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const SETTINGS_TABS = [
  "account",
  "security",
  "appearance",
  "api-keys",
  "credentials",
  "organizations",
  "organization",
  "members",
  "users",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** Sidebar group headings, in display order. */
export const SETTINGS_GROUPS = [
  "Personal",
  "Organization",
  "Administration",
] as const;

export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export interface SettingsNavItem {
  id: SettingsTab;
  group: SettingsGroup;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface SettingsShellProps {
  items: readonly SettingsNavItem[];
  titles?: readonly SettingsNavItem[];
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  children: ReactNode;
}

/**
 * Traditional settings chrome: vertical section nav + main content column.
 * Presentational — no I/O. Parent owns tab state (URL search).
 */
export function SettingsShell({
  items,
  titles,
  activeTab,
  onTabChange,
  children,
}: SettingsShellProps) {
  const groups = SETTINGS_GROUPS.flatMap((group) => {
    const entries = items.filter((item) => item.group === group);
    return entries.length > 0 ? [{ group, entries }] : [];
  });
  const catalog = titles ?? items;
  const active =
    catalog.find((item) => item.id === activeTab) ??
    items.find((item) => item.id === activeTab) ??
    items[0];

  return (
    <div className="flex flex-col gap-4 lg:flex-1 lg:flex-row lg:gap-0">
      {/* Mirrors the app sidebar: flush to the inset edge, starts right under the page header, same group label and row sizes. */}
      <aside className="lg:border-sidebar-border lg:-mb-4 lg:-ml-4 lg:w-52 lg:shrink-0 lg:self-stretch lg:border-r">
        <nav className="mt-3 flex flex-row gap-1 overflow-x-auto lg:mt-0 lg:flex-col lg:gap-0 lg:overflow-visible">
          {groups.map(({ group, entries }) => (
            // Same shape as SidebarGroup > label + SidebarMenu: px-2 py-1, 32px label, 1px between rows.
            <div
              key={group}
              className="contents lg:relative lg:flex lg:min-w-0 lg:flex-col lg:px-2 lg:py-1"
            >
              <span className="text-sidebar-foreground/70 hidden h-8 shrink-0 items-center rounded-md px-2 text-xs lg:flex">
                {group}
              </span>
              <ul className="contents lg:flex lg:w-full lg:min-w-0 lg:flex-col lg:gap-px">
                {entries.map((item) => {
                  const Icon = item.icon;
                  const selected = item.id === activeTab;
                  return (
                    <li key={item.id} className="contents lg:relative lg:block">
                      <button
                        type="button"
                        onClick={() => {
                          onTabChange(item.id);
                        }}
                        className={cn(
                          "ring-sidebar-ring active:bg-sidebar-accent active:text-sidebar-accent-foreground flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-left text-xs outline-hidden transition-colors focus-visible:ring-2 lg:w-full [&_svg]:size-4 [&_svg]:shrink-0",
                          selected
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                        aria-current={selected ? "page" : undefined}
                      >
                        <Icon />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 lg:pt-4 lg:pl-8">
        <div className="mb-4 space-y-1">
          <h2 className="text-foreground text-base font-semibold">
            {active.label}
          </h2>
          <p className="text-muted-foreground text-sm">{active.description}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
