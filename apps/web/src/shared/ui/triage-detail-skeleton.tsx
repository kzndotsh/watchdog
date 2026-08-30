import { cn } from "@/lib/utils";
import {
  DetailContextHeader,
  DetailContextSep,
} from "@/shared/ui/detail-context-strip";
import { DetailFooter } from "@/shared/ui/detail-footer";
import { Skeleton } from "@/shared/ui/shadcn/skeleton";

/** Triage detail skeleton — context strip + ledger + decide footer. */
export function TriageDetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <header className="shrink-0">
        <DetailContextHeader>
          <span className="text-muted-foreground shrink-0">Entity</span>
          <Skeleton className="inline-block h-3 w-24 rounded-sm align-middle" />
          <DetailContextSep />
          <Skeleton className="inline-block h-3 w-20 rounded-sm align-middle" />
          <DetailContextSep />
          <Skeleton className="inline-block h-5 w-16 rounded-md align-middle" />
        </DetailContextHeader>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="border-border overflow-hidden rounded-md border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="border-border flex flex-col gap-1.5 border-b px-2.5 py-2 last:border-b-0"
              >
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <DetailFooter
        leading={
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <Skeleton className="h-7 w-28 rounded-md" />
            <Skeleton className="h-7 w-36 rounded-md" />
          </div>
        }
      >
        <Skeleton className="h-7 w-16 rounded-md" />
        <Skeleton className="h-7 w-16 rounded-md" />
      </DetailFooter>
    </div>
  );
}
