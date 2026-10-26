import { memoizeImport } from "@/shared/lib/preload-import";

/*
 * The Filters and Display options popover bodies are separate chunks: the toolbar buttons stay
 * in the route's bundle and the bodies load on first open, warmed on hover or focus of the
 * trigger (`prefetchImport`).
 */
export const loadFiltersBody = memoizeImport(
  async () => import("@/shared/ui/list/parts/filters-popover-body")
);

export const loadDisplayBody = memoizeImport(
  async () => import("@/shared/ui/list/parts/display-popover-body")
);
