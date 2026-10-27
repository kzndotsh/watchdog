import { CASE_CARD_SHELL_CLASS } from "@/shared/ui/case-card-shell";

/**
 * Library card box: shared by the cards and their loading skeleton so the two match. Plain
 * strings only in this module: a top-level call keeps it in every bundle that imports the barrel.
 */
export const LIBRARY_CARD_CLASS = `${CASE_CARD_SHELL_CLASS} focus-visible:ring-ring/40 flex h-full min-h-44 flex-col gap-2 p-4 focus-visible:ring-2 focus-visible:outline-none`;

/** Library card columns. */
export const LIBRARY_CARD_GRID_CLASS =
  "grid grid-cols-1 gap-3 p-px sm:grid-cols-2 lg:grid-cols-3";

/** A Library section heading (a category under All). */
export const LIBRARY_GROUP_HEADING_CLASS =
  "text-muted-foreground mb-2 text-xs font-medium";

/**
 * The category rail mirrors the Settings nav, and through it the app sidebar: flush to the inset
 * edge under the page header, a right border, a group label and 32px rows. At phone width it is a
 * row of pills above the content.
 */
export const LIBRARY_RAIL_NAV_CLASS =
  "lg:border-sidebar-border lg:-mb-4 lg:-ml-4 lg:w-52 lg:shrink-0 lg:self-stretch lg:border-r";
export const LIBRARY_RAIL_LIST_CLASS =
  "flex flex-row gap-1 overflow-x-auto lg:flex-col lg:gap-px lg:overflow-visible lg:px-2 lg:py-1";
export const LIBRARY_RAIL_LABEL_CLASS =
  "text-sidebar-foreground/70 hidden h-8 shrink-0 items-center rounded-md px-2 text-xs lg:flex";
export const LIBRARY_RAIL_ITEM_CLASS =
  "ring-sidebar-ring text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-left text-xs whitespace-nowrap outline-hidden transition-colors focus-visible:ring-2 lg:w-full [&_svg]:size-4 [&_svg]:shrink-0";
export const LIBRARY_RAIL_ITEM_SELECTED_CLASS =
  "bg-sidebar-accent text-sidebar-accent-foreground font-medium";

/** The Library's content column beside the rail. */
export const LIBRARY_MAIN_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col gap-3 lg:pt-4 lg:pl-4";

/** A Library banner (start from, keys). */
export const LIBRARY_BANNER_CLASS =
  "border-border bg-muted/20 flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between";

/** A Library entry's page: frame, columns, and the hairline aside. */
export const LIBRARY_ENTRY_PAGE_CLASS =
  "flex w-full max-w-7xl flex-col gap-8 pt-1 pb-4";
/** The back link sits tight over the page body. */
export const LIBRARY_ENTRY_TOP_CLASS = "flex flex-col gap-4";
/**
 * The back link's row: 32px under the page's 4px top padding, the same shape as the app sidebar's
 * first group label (py-1, h-8, text-xs), so "Back" sits on the line of "Case" at its size.
 */
export const LIBRARY_ENTRY_BACK_ROW_CLASS = "flex h-8 items-center";
export const LIBRARY_ENTRY_COLUMNS_CLASS =
  "grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_16rem]";
export const LIBRARY_ENTRY_MAIN_CLASS =
  "flex min-w-0 flex-col gap-10 lg:col-start-1";
export const LIBRARY_ENTRY_ASIDE_CLASS =
  "border-border/60 flex flex-col gap-4 border-t pt-8 lg:sticky lg:top-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8";
/** A hairline box in an entry page (the "How it works" flow, a stage's step). */
export const LIBRARY_ENTRY_BOX_CLASS =
  "border-border/60 flex min-w-0 flex-col gap-1.5 rounded-md border p-3 text-sm";
