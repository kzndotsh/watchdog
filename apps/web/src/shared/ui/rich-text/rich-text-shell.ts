/**
 * Shell geometry shared by the real editor and its lazy-load skeleton, so the swap is
 * layout-neutral. Keep this module free of Plate imports: the skeleton imports it eagerly.
 */

/** Toolbar row height; the real toolbar and the skeleton both use it. */
export const RICH_TEXT_TOOLBAR_MIN_HEIGHT_CLASS = "min-h-9";

export function shellMinHeight(
  shouldFill: boolean,
  isSeamless: boolean
): string {
  if (shouldFill) return "min-h-0 flex-1";
  if (isSeamless) return "min-h-[7.5rem]";
  return "min-h-[8.75rem]";
}
