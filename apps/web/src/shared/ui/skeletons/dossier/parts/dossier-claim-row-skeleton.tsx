import { Skeleton } from "@watchdog/ui/components/skeleton";

export function DossierClaimRowSkeleton() {
  return (
    <div className="flex items-start gap-2">
      <Skeleton className="mt-0.5 h-3 w-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[85%]" />
        <div className="flex flex-wrap gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>
    </div>
  );
}
