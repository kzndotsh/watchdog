import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/primitives/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@watchdog/ui/components/empty";

/**
 * Queue / page empty intents (Geist catalog).
 * Select-none stays on `DetailEmpty`. Load failures stay on `FetchErrorAlert`.
 * Quiet chrome (no dashed frame) — split queues looked caged with outlined empties.
 */
export type EmptyStateIntent = "blank-slate" | "no-results" | "cleared";

function capitalize(items: string): string {
  if (!items) return items;
  return items.charAt(0).toUpperCase() + items.slice(1);
}

export function EmptyState({
  intent,
  items,
  query,
  onClearFilters,
  title: titleOverride,
  description: descriptionOverride,
  action,
  size = "default",
  framed = false,
  className,
}: {
  intent: EmptyStateIntent;
  /** Plural resource noun for copy (“jobs”, “proposals”). */
  items: string;
  /** Active search string — quoted in no-results title when set. */
  query?: string;
  onClearFilters?: () => void;
  title?: string;
  description?: ReactNode;
  /** Overrides default Clear / Show all button. */
  action?: ReactNode;
  /** `sm` = compact blank slate inside a tab or panel (py-6). */
  size?: "default" | "sm";
  /** Dashed frame for a whole-page empty (Dossier section). */
  framed?: boolean;
  className?: string;
}) {
  const Items = capitalize(items);
  const q = query?.trim();

  let title: string;
  let description: ReactNode;
  let cta: ReactNode = action;

  switch (intent) {
    case "blank-slate": {
      title = titleOverride ?? `No ${Items} Yet`;
      description =
        descriptionOverride ??
        "Create or run something to populate this queue.";
      break;
    }
    case "no-results": {
      title =
        titleOverride ??
        (q
          ? `No ${Items} Match \u201C${q}\u201D`
          : `No ${Items} Match Your Filters`);
      description =
        descriptionOverride ??
        (q
          ? "Adjust your search or clear filters to see more."
          : "Try a different status or clear filters.");
      if ((cta === null || cta === undefined) && onClearFilters) {
        cta = (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
        );
      }
      break;
    }
    case "cleared": {
      title = titleOverride ?? "Nothing Ready to Review";
      description = descriptionOverride ?? "All caught up for this filter.";
      if ((cta === null || cta === undefined) && onClearFilters) {
        cta = (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClearFilters}
          >
            Show all
          </Button>
        );
      }
      break;
    }
    default: {
      const _exhaustive: never = intent;
      throw new Error(`Unhandled empty intent: ${JSON.stringify(_exhaustive)}`);
    }
  }

  return (
    <Empty
      aria-live="polite"
      className={cn(
        "min-h-0 flex-1 rounded-none border-0",
        size === "sm" ? "py-6" : "py-12",
        framed && "border-border/60 rounded-lg border border-dashed",
        className
      )}
    >
      <EmptyHeader>
        <EmptyTitle className="text-muted-foreground font-medium">
          {title}
        </EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {cta ? <EmptyContent>{cta}</EmptyContent> : null}
    </Empty>
  );
}
