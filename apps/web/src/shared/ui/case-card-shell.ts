/** Case grid card min height — shared with skeletons + layout ghost slots. */
export const CASE_CARD_MIN_HEIGHT_CLASS = "min-h-36";

/** Case list card — border on page background (dashboard metric tiles). */
export const CASE_CARD_SHELL_CLASS =
  "border-border text-foreground rounded-lg border transition-colors hover:bg-muted/50";

/** Active case emphasis — primary border, light selected fill. */
export const CASE_CARD_ACTIVE_CLASS =
  "border-primary/35 bg-muted/30 ring-1 ring-primary/10";

/** Dashed create slot — matches task board add-card CTA. */
export const CASE_CREATE_SHELL_CLASS =
  "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/30 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed transition-colors focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-2 focus-visible:outline-none";
