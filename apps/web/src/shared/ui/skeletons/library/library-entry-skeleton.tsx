import {
  LIBRARY_ENTRY_COLUMNS_CLASS,
  LIBRARY_ENTRY_PAGE_CLASS,
  LIBRARY_ENTRY_ASIDE_CLASS,
  LIBRARY_ENTRY_BOX_CLASS,
  LIBRARY_ENTRY_MAIN_CLASS,
} from "@/shared/ui/library-shell";
import { Skeleton } from "@watchdog/ui/components/skeleton";

const FLOW_BOX_COUNT = 3;
const ASIDE_ROW_COUNT = 5;

/**
 * A Library entry's page while the catalog loads: the header (kind tile, title, Run on…) and the
 * two columns, in the same boxes as the loaded page so nothing shifts.
 */
export function LibraryEntrySkeleton() {
  return (
    <div className={LIBRARY_ENTRY_PAGE_CLASS} aria-hidden>
      <div className="flex flex-col gap-6">
        <Skeleton className="h-3 w-14" />
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Skeleton className="size-14 shrink-0" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
          <Skeleton className="h-9 w-72 shrink-0" />
        </div>
      </div>
      <div className={LIBRARY_ENTRY_COLUMNS_CLASS}>
        <div className={LIBRARY_ENTRY_MAIN_CLASS}>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-full max-w-prose" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-24" />
            <div className="flex flex-col gap-2 md:flex-row">
              {Array.from({ length: FLOW_BOX_COUNT }, (_, i) => (
                <div key={i} className={`${LIBRARY_ENTRY_BOX_CLASS} flex-1`}>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={LIBRARY_ENTRY_ASIDE_CLASS}>
          {Array.from({ length: ASIDE_ROW_COUNT }, (_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
