import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { AppBreadcrumbs } from "@/shared/layout/app-breadcrumbs";
import type { CountOnTrailId } from "@/shared/layout/page-trail";
import { SidebarTrigger } from "@/shared/ui/shadcn/sidebar";

export type PageDensity = "default" | "split";

/**
 * Standard page frame.
 * pt-0 so PageHeader sits flush at the top of the inset (no gap above it).
 * Side + bottom padding kept for content breathing room.
 */
export function Page({
  children,
  className,
  density = "default",
}: {
  children: ReactNode;
  className?: string;
  density?: PageDensity;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 px-3 pt-0 pb-3 sm:px-4 sm:pt-0 sm:pb-4",
        density === "default" && "overflow-y-auto",
        density === "split" && "max-w-none overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Sticky page header — sole top chrome for the inset.
 * Always mounts the route + Active-Case trail. Optional `below` merges a
 * second row (e.g. line tabs) into the same border-b.
 */
export function PageHeader({
  current,
  count,
  countOn,
  description,
  actions,
  below,
  className,
}: {
  current?: ReactNode;
  /** TabCount on the last crumb (hidden at 0). Use for row totals, not prose. */
  count?: number;
  /** Last-crumb id this count belongs to — hides the pill when the trail has already moved. */
  countOn?: CountOnTrailId;
  /** 404 missing-slug copy only — not page explainers. */
  description?: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-background sticky top-0 z-20 -mx-3 flex shrink-0 flex-col border-b sm:-mx-4",
        className
      )}
    >
      <div className="flex h-10 items-center gap-2 pr-3 pl-2 sm:pr-4">
        <SidebarTrigger className="-ml-0.5 shrink-0" />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <AppBreadcrumbs current={current} count={count} countOn={countOn} />
          {description ? (
            <span className="text-muted-foreground min-w-0 truncate text-sm">
              {description}
            </span>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {below === undefined ? null : <div className="px-2 pb-0">{below}</div>}
    </div>
  );
}
