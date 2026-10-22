import { cn } from "@/lib/utils";
import { CASE_CARD_SHELL_CLASS } from "@/shared/ui/case-card-shell";

/** Library card box: shared by the cards and their loading skeleton so the two match. */
export const LIBRARY_CARD_CLASS = cn(
  CASE_CARD_SHELL_CLASS,
  "focus-visible:ring-ring/40 flex h-full min-h-44 flex-col gap-2 p-4 focus-visible:ring-2 focus-visible:outline-none"
);

/** Library card columns. */
export const LIBRARY_CARD_GRID_CLASS =
  "grid grid-cols-1 gap-3 p-px sm:grid-cols-2 lg:grid-cols-3";

/** A Library section heading (a category under All). */
export const LIBRARY_GROUP_HEADING_CLASS =
  "text-muted-foreground mb-2 text-xs font-medium";

/** The category rail: frame, list and one row. */
export const LIBRARY_RAIL_NAV_CLASS = "md:w-44 md:shrink-0";
export const LIBRARY_RAIL_LIST_CLASS =
  "flex gap-1 overflow-x-auto md:flex-col md:overflow-visible";
export const LIBRARY_RAIL_ITEM_CLASS =
  "text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:ring-ring/40 flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none";

/** A Library banner (start from, keys). */
export const LIBRARY_BANNER_CLASS =
  "border-border bg-muted/20 flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between";

/** A Library entry's page: frame, facts strip, columns, and the hairline aside. */
export const LIBRARY_ENTRY_PAGE_CLASS =
  "mx-auto flex w-full max-w-5xl flex-col gap-8 pt-10 pb-24";
export const LIBRARY_ENTRY_FACTS_CLASS =
  "border-border/60 divide-border/60 -mx-4 flex divide-x overflow-x-auto border-y px-4 py-3";
export const LIBRARY_ENTRY_FACT_CLASS =
  "flex min-w-28 flex-1 shrink-0 flex-col gap-0.5 px-4 first:pl-0 last:pr-0";
export const LIBRARY_ENTRY_COLUMNS_CLASS =
  "grid gap-12 lg:grid-cols-[minmax(0,1fr)_16rem]";
export const LIBRARY_ENTRY_MAIN_CLASS = "flex min-w-0 flex-col gap-10";
export const LIBRARY_ENTRY_ASIDE_CLASS =
  "border-border/60 flex flex-col gap-4 border-t pt-8 lg:sticky lg:top-8 lg:self-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8";
/** A hairline box in an entry page (the "How it works" flow, a stage's step). */
export const LIBRARY_ENTRY_BOX_CLASS =
  "border-border/60 flex min-w-0 flex-col gap-1.5 rounded-md border p-3 text-sm";
