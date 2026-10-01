import { cn } from "@/lib/utils";
import {
  DetailContextHeader,
  DetailContextSep,
} from "@/shared/ui/detail-context-line";
import { TabCount } from "@/shared/ui/tab-count";
import { Skeleton } from "@watchdog/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@watchdog/ui/components/tabs";

/** Size tab skeleton from real label metrics — fixed widths drift vs `text-sm` triggers. */
function SkeletonTabLabel({ children }: { children: string }) {
  return (
    <span className="relative inline-block leading-none">
      <span className="invisible text-sm" aria-hidden>
        {children}
      </span>
      <Skeleton className="absolute inset-0 rounded-sm" />
    </span>
  );
}

function SkeletonTabCount() {
  return (
    <TabCount
      n={1}
      className="bg-muted animate-pulse border-transparent text-transparent"
    />
  );
}

/**
 * Job detail skeleton, shaped like `JobDetailHeader`: headline → input hint · status · By actor,
 * then the Log / Input / Output tabs and a log block. Collect shows jobs as often as evidence.
 */
export function JobDetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <header className="flex shrink-0 flex-col">
        <DetailContextHeader>
          <Skeleton className="inline-block h-3 w-24 rounded-sm align-middle" />
          <span aria-hidden className="text-muted-foreground/60 shrink-0">
            →
          </span>
          <Skeleton className="inline-block h-3 w-28 rounded-sm align-middle" />
          <DetailContextSep />
          <Skeleton className="inline-block h-3 w-14 rounded-sm align-middle" />
          <DetailContextSep />
          <span className="text-muted-foreground shrink-0">By</span>
          <Skeleton className="inline-block h-3 w-16 rounded-sm align-middle" />
        </DetailContextHeader>

        <Tabs value="log">
          <div className="border-border border-b px-2 pb-0">
            <TabsList variant="line" className="pointer-events-none h-8">
              <TabsTrigger value="log" disabled className="pointer-events-none">
                <SkeletonTabLabel>Log</SkeletonTabLabel>
              </TabsTrigger>
              <TabsTrigger
                value="input"
                disabled
                className="pointer-events-none"
              >
                <SkeletonTabLabel>Input</SkeletonTabLabel>
              </TabsTrigger>
              <TabsTrigger
                value="output"
                disabled
                className="pointer-events-none gap-1"
              >
                <SkeletonTabLabel>Output</SkeletonTabLabel>
                <SkeletonTabCount />
              </TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="bg-muted/30 flex flex-col gap-2 rounded-md px-3 py-3">
          <Skeleton className="h-3 w-3/5 rounded-sm" />
          <Skeleton className="h-3 w-2/5 rounded-sm" />
          <Skeleton className="h-3 w-1/2 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
