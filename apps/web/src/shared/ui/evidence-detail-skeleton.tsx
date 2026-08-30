import { cn } from "@/lib/utils";
import { ArtifactPreviewSkeleton } from "@/shared/ui/artifact-preview";
import {
  DetailContextHeader,
  DetailContextSep,
} from "@/shared/ui/detail-context-strip";
import { DetailFooter } from "@/shared/ui/detail-footer";
import { CHIP_SIZE_CLASS } from "@/shared/ui/detail-status-chip";
import { Skeleton } from "@/shared/ui/shadcn/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { TabCount } from "@/shared/ui/tab-count";

/** Size tab skeleton from real label metrics — fixed widths drift vs `text-sm` triggers. */
function SkeletonTabLabel({ children }: { children: string }) {
  return (
    <span className="relative inline-block leading-none">
      <span className="invisible text-sm font-medium" aria-hidden>
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

/** Evidence / Collect detail skeleton — inspector strip + tabs (queue owns title/id). */
export function EvidenceDetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <header className="flex shrink-0 flex-col">
        <DetailContextHeader>
          <span className="text-muted-foreground shrink-0">Entity</span>
          <Skeleton className="inline-block h-3 w-24 rounded-sm align-middle" />
          <DetailContextSep />
          <span className="text-muted-foreground shrink-0">From</span>
          <Skeleton className="inline-block h-3 w-20 rounded-sm align-middle" />
          <DetailContextSep />
          <Skeleton
            className={cn(
              CHIP_SIZE_CLASS.md,
              "inline-block w-16 shrink-0 align-middle"
            )}
          />
        </DetailContextHeader>

        <Tabs value="content">
          <div className="border-border border-b px-2 pb-0">
            <TabsList variant="line" className="pointer-events-none h-8">
              <TabsTrigger
                value="content"
                disabled
                className="pointer-events-none"
              >
                <SkeletonTabLabel>Content</SkeletonTabLabel>
              </TabsTrigger>
              <TabsTrigger
                value="output"
                disabled
                className="pointer-events-none gap-1"
              >
                <SkeletonTabLabel>Output</SkeletonTabLabel>
                <SkeletonTabCount />
              </TabsTrigger>
              <TabsTrigger
                value="jobs"
                disabled
                className="pointer-events-none gap-1"
              >
                <SkeletonTabLabel>Jobs</SkeletonTabLabel>
                <SkeletonTabCount />
              </TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ArtifactPreviewSkeleton />
      </div>

      <DetailFooter leading={<Skeleton className="h-7 w-24 rounded-md" />}>
        <Skeleton className="h-7 w-16 rounded-md" />
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-7 w-12 rounded-md" />
      </DetailFooter>
    </div>
  );
}
