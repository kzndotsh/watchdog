/* oxlint-disable react/only-export-components, react-doctor/only-export-components -- shell + tab constants */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const SETTINGS_TABS = [
  "account",
  "security",
  "team",
  "users",
  "api-keys",
  "credentials",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export interface SettingsNavItem {
  id: SettingsTab;
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
  const catalog = titles ?? items;
  const active =
    catalog.find((item) => item.id === activeTab) ??
    items.find((item) => item.id === activeTab) ??
    items[0];

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <aside className="lg:w-56 lg:shrink-0">
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {items.map((item) => {
            const Icon = item.icon;
            const selected = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onTabChange(item.id);
                }}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  selected
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
                aria-current={selected ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
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
