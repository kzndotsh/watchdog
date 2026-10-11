import { Skeleton } from "@watchdog/ui/components/skeleton";

export function DossierConnectionListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {["Outbound", "Inbound"].map((label) => (
        <div key={label} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-16" />
          <ul className="border-border divide-border divide-y rounded-md border">
            {Array.from({ length: rows }).map((_, index) => (
              <li key={`${label}-${index}`} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-14 shrink-0" />
                  <Skeleton className="h-4 min-w-0 flex-1" />
                  <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
