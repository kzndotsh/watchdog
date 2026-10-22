import { cn } from "@/lib/utils";
import { SKELETON_DELAY_CLASS } from "@/shared/lib/skeleton-delay";
import {
  LIBRARY_RAIL_ITEM_CLASS,
  LIBRARY_RAIL_LABEL_CLASS,
  LIBRARY_RAIL_LIST_CLASS,
  LIBRARY_RAIL_NAV_CLASS,
} from "@/shared/ui/library-shell";
import { Skeleton } from "@watchdog/ui/components/skeleton";

const RAIL_LABEL_WIDTHS = [
  "w-8",
  "w-16",
  "w-12",
  "w-12",
  "w-14",
  "w-12",
  "w-14",
  "w-12",
  "w-8",
];

/**
 * The Library's category rail while the catalog loads: the real nav frame, label and 32px rows
 * (icon, label and count blocks). It renders beside the content's LoadingRegion, not inside it,
 * so it takes the same appear delay itself.
 */
export function LibraryRailSkeleton() {
  return (
    <div
      className={cn(LIBRARY_RAIL_NAV_CLASS, SKELETON_DELAY_CLASS)}
      aria-hidden
    >
      <ul className={LIBRARY_RAIL_LIST_CLASS}>
        <li className={LIBRARY_RAIL_LABEL_CLASS}>
          <Skeleton className="h-3 w-16" />
        </li>
        {RAIL_LABEL_WIDTHS.map((width, i) => (
          <li key={i} className="shrink-0 lg:block">
            <div className={LIBRARY_RAIL_ITEM_CLASS}>
              <Skeleton className="size-4" />
              <Skeleton className={cn("h-3", width)} />
              <Skeleton className="ml-auto h-3 w-4" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
