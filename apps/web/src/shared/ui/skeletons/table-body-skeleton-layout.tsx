import { cn } from "@/lib/utils";
import { TABLE_BODY_SKELETON_ROW_COUNT } from "@/shared/ui/skeletons/constants";
import { Skeleton } from "@watchdog/ui/components/skeleton";

/** Flex table-row blocks for dossier tab previews — not production `DataTable`. */
export function TableBodySkeletonLayout({
  rows = TABLE_BODY_SKELETON_ROW_COUNT,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="border-border flex h-10 items-start border-b px-3"
        >
          {Array.from({ length: columns }).map((__, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn(
                "h-2.5 shrink-0",
                colIndex === 0 ? "w-32" : "w-16 flex-1"
              )}
            />
          ))}
        </div>
      ))}
    </>
  );
}
