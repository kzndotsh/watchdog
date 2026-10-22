import { cn } from "@/lib/utils";
import { SKELETON_DELAY_CLASS } from "@/shared/lib/skeleton-delay";
import {
  LIBRARY_RAIL_ITEM_CLASS,
  LIBRARY_RAIL_LIST_CLASS,
  LIBRARY_RAIL_NAV_CLASS,
} from "@/shared/ui/library-shell";
import { Skeleton } from "@watchdog/ui/components/skeleton";

const RAIL_ROWS = [
  "All",
  "Playbooks",
  "Archive",
  "Breach",
  "Evidence",
  "Identity",
  "Network",
  "Threat",
  "Web",
];

/**
 * The Library's category rail while the catalog loads: the real row boxes with a label and
 * count block in each. It renders beside the content's LoadingRegion, not inside it, so it
 * takes the same appear delay itself.
 */
export function LibraryRailSkeleton() {
  return (
    <div
      className={cn(LIBRARY_RAIL_NAV_CLASS, SKELETON_DELAY_CLASS)}
      aria-hidden
    >
      <ul className={LIBRARY_RAIL_LIST_CLASS}>
        {RAIL_ROWS.map((label) => (
          <li key={label} className="shrink-0">
            <div className={LIBRARY_RAIL_ITEM_CLASS}>
              <span className="relative">
                <span className="invisible">{label}</span>
                <Skeleton className="absolute inset-0" />
              </span>
              <Skeleton className="h-3 w-4" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
