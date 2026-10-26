import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { AppBreadcrumbs } from "@/shared/layout/app-breadcrumbs";
import type { CountOnTrailId } from "@/shared/layout/page-trail";
import { SidebarTrigger } from "@watchdog/ui/components/sidebar";

type PageHeaderProps = {
  current?: ReactNode;
  /**
   * TabCount on the last crumb (hidden at 0). Use for row totals, not prose. A declared list
   * passes `<ListCount count={list.count} noun={def.noun} variant="compact" isLive={false} />`.
   */
  count?: number | ReactElement;
  /** Last-crumb id this count belongs to — hides the pill when the trail has already moved. */
  countOn?: CountOnTrailId;
  /** 404 missing-slug copy only — not page explainers. */
  description?: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
  className?: string;
};

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
}: PageHeaderProps) {
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
