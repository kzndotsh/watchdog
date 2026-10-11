import { Skeleton } from "@watchdog/ui/components/skeleton";

export function StackBodySkeletonLayout({
  sections = 3,
}: {
  sections?: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
