import { cn } from "@/lib/utils";
import {
  compactCountLabel,
  countAnnouncement,
  fullCountLabel,
} from "@/shared/lib/list/list-copy";
import type { ListCountValue } from "@/shared/lib/list/list-types";

type ListCountProps = {
  readonly count: ListCountValue;
  /** The list's noun, for the announcement ("1,000+ evidence"). */
  readonly noun: { readonly one: string; readonly many: string };
  /** `compact` for `PageHeader` / `TabCount` / a queue header ("1,000+"); `full` for the footer. */
  readonly variant: "compact" | "full";
  /**
   * Whether this count is the list's polite live region. One per list: the footer's count is,
   * a header's copy of it passes false.
   */
  readonly isLive?: boolean;
  readonly className?: string;
};

/**
 * A list's count in mono tabular figures: `full` "Showing 50 of 1,000+" / "Showing 12",
 * `compact` "1,000+" / "12". Nothing visible until there are rows. The live region
 * announces the matching total once per settled view, never per keystroke or per Load more page
 * ("1,000+ evidence"); an empty view is left to the empty state, which announces itself.
 */
export function ListCount({
  count,
  noun,
  variant,
  isLive = true,
  className,
}: ListCountProps) {
  // The previous view's count stays (de-emphasised with its rows) until the new one lands.
  const isShown = count.loaded > 0;
  const isAnnounced = isShown && count.isSettled;
  const text =
    variant === "full" ? fullCountLabel(count) : compactCountLabel(count);
  return (
    <span
      data-slot="list-count"
      data-empty={isShown ? undefined : ""}
      className={cn("font-mono tabular-nums", className)}
    >
      {isShown ? <span aria-hidden={isLive || undefined}>{text}</span> : null}
      {isLive ? (
        <span className="sr-only" role="status" aria-live="polite" aria-atomic>
          {isAnnounced ? countAnnouncement(count, noun) : ""}
        </span>
      ) : null}
    </span>
  );
}
