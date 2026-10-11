import { Skeleton } from "@watchdog/ui/components/skeleton";

/** Inner queue-row blocks — composed by `QueueSkeleton`. */
export function QueueBodySkeletonLayout({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1 border-b px-3 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-2.5 w-36" />
            <Skeleton className="h-2 w-10" />
          </div>
          <Skeleton className="h-2 w-24" />
        </div>
      ))}
    </div>
  );
}
