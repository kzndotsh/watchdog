/**
 * Dense field chrome shared by SearchField, Select triggers, EntityCombobox,
 * and graph field selects. Keep height / radius / type / surface in lockstep.
 *
 * Menu items (SelectItem / ComboboxItem) also use CONTROL_TEXT via shadcn defaults.
 * Surface matches InputGroup: transparent light, dark:bg-input/30.
 */
export const CONTROL_HEIGHT = "h-8";
export const CONTROL_TEXT = "text-xs";
const CONTROL_RADIUS = "rounded-md";
const CONTROL_SURFACE = "bg-transparent dark:bg-input/30";

/** SelectTrigger / field controls — height + type + radius + surface. */
export const CONTROL_TRIGGER = `${CONTROL_HEIGHT} ${CONTROL_RADIUS} ${CONTROL_TEXT} ${CONTROL_SURFACE}`;

/**
 * Standalone button/popover trigger matching SelectTrigger + CONTROL_TRIGGER
 * (same pairing as ConfidenceSelect / FieldSelect / ClaimClassSelect).
 * Padding / flex must stay in lockstep with shadcn SelectTrigger.
 * Resting border comes from global `--border` / `--input` tokens.
 */
export const CONTROL_FIELD_TRIGGER = [
  "wd-field-trigger",
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:hover:bg-input/50",
  "flex w-auto items-center justify-between gap-1.5 border py-2 pr-2 pl-2.5 whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  CONTROL_TRIGGER,
].join(" ");

/**
 * Dense table-cell control (EditableSelectCell).
 * Pair with SelectTrigger `size="sm"` (`data-[size=sm]:h-7`) — bare `h-7`
 * loses to `data-[size=default]:h-8` on specificity.
 * Transparent resting border — table CSS quiets the outline further.
 */
export const CONTROL_CELL =
  "h-7 w-full min-w-0 max-w-full rounded-md border-transparent bg-transparent py-0 shadow-none hover:bg-muted/40 focus-visible:border-ring focus-visible:bg-background";

/**
 * InputGroup / ComboboxInput twin of CONTROL_CELL (Peer in composers).
 * Table CSS applies the same quiet border/fill as SelectTrigger.
 */
export const CONTROL_CELL_SHELL =
  "h-7 w-full min-w-0 max-w-full rounded-md border-transparent bg-transparent py-0 shadow-none dark:bg-transparent hover:bg-muted/40 focus-within:border-ring focus-within:bg-background [&_[data-slot=input-group-control]]:h-7 [&_[data-slot=input-group-control]]:min-w-0 [&_[data-slot=input-group-control]]:truncate [&_[data-slot=input-group-control]]:text-xs";

/** Base UI Select `onValueChange` may pass string | string[]. */
export function resolveSelectValue(next: unknown): string | null {
  if (Array.isArray(next)) {
    const first: unknown = next[0];
    return typeof first === "string" ? first : null;
  }
  return typeof next === "string" ? next : null;
}
