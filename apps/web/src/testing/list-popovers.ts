import {
  loadDisplayBody,
  loadFiltersBody,
} from "@/shared/ui/list/parts/load-popover-bodies";

/**
 * Load both lazy list-popover chunks before a test opens them, so `findBy*` never races a
 * cold chunk on a loaded CI runner. Call it in `beforeAll` of every test file that opens the
 * Filters or Display options popover, except the one testing the lazy path itself.
 */
export async function preloadListPopovers(): Promise<void> {
  await Promise.all([loadFiltersBody(), loadDisplayBody()]);
}
