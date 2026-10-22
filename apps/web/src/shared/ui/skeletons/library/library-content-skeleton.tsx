import { CHIP_SIZE_CLASS } from "@/shared/ui/chip";
import {
  LIBRARY_BANNER_CLASS,
  LIBRARY_CARD_CLASS,
  LIBRARY_CARD_GRID_CLASS,
  LIBRARY_GROUP_HEADING_CLASS,
} from "@/shared/ui/library-shell";
import { LIBRARY_CARD_SKELETON_SLOT_COUNT } from "@/shared/ui/skeletons/constants";
import { Skeleton } from "@watchdog/ui/components/skeleton";

const QUICK_PICK_WIDTHS = ["w-16", "w-20", "w-10", "w-24", "w-10"];

/** One card: input-kind tile and title, two lines of description, the kind chip. */
function LibraryCardSkeleton() {
  return (
    <div className={LIBRARY_CARD_CLASS}>
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-9 shrink-0" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="mt-auto flex items-center gap-1.5">
        <Skeleton className={`${CHIP_SIZE_CLASS.sm} w-10`} />
      </div>
    </div>
  );
}

/**
 * The Library's content while the catalog loads: both banners, a section heading and a page of
 * card placeholders, all in the real boxes. The keys banner is kept, since most viewers are
 * missing some key and dropping it would shift the cards when the catalog lands.
 */
export function LibraryContentSkeleton({
  slots = LIBRARY_CARD_SKELETON_SLOT_COUNT,
}: {
  slots?: number;
}) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className={LIBRARY_BANNER_CLASS}>
        <Skeleton className="h-4 w-40" />
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PICK_WIDTHS.map((width, i) => (
            <Skeleton key={i} className={`h-7 ${width}`} />
          ))}
        </div>
      </div>
      <div className={LIBRARY_BANNER_CLASS}>
        <div className="flex items-center gap-2">
          <Skeleton className="size-4 shrink-0" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-6 w-24" />
      </div>
      <div>
        <div className={LIBRARY_GROUP_HEADING_CLASS}>
          <Skeleton className="h-3 w-20" />
        </div>
        <div className={LIBRARY_CARD_GRID_CLASS}>
          {Array.from({ length: slots }, (_, i) => (
            <LibraryCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
