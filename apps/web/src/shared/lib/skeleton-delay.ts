/**
 * Show-delay for in-page skeletons: a skeleton stays mounted (reserving layout) but invisible
 * until loading has lasted this long, so local fetches that land in 30-100ms never flash a
 * skeleton. Pure CSS (`.wd-skeleton-delay` in `styles/wd-overrides.css`), so it is hydration-safe.
 * Keep `--skeleton-show-delay` in that stylesheet equal to this value (test-enforced).
 * There is no minimum display time. See `docs/reference/web/ui/loading.md` rule 16.
 */
export const SKELETON_SHOW_DELAY_MS = 250;

/** The class the stylesheet targets. */
export const SKELETON_DELAY_CLASS = "wd-skeleton-delay";
