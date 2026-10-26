import { TASK_CARD_SHELL_CLASS } from "@/shared/ui/task-board-shell";
import { Skeleton } from "@watchdog/ui/components/skeleton";

/** Task card layout — mirrors TaskCard / TaskCardPreview shell. */
export function TaskCardSkeleton({
  shouldShowFooter = true,
}: {
  shouldShowFooter?: boolean;
}) {
  return (
    <div className={TASK_CARD_SHELL_CLASS}>
      {shouldShowFooter ? (
        <div className="bg-muted/40 flex h-6 items-center gap-1.5 px-2.5">
          <Skeleton className="h-3 w-3 shrink-0 rounded-xs" />
          <Skeleton className="h-3 w-24 shrink-0 rounded-sm" />
        </div>
      ) : null}
      <div className="px-2.5 py-2">
        <Skeleton className="h-4 w-4/5 rounded-sm" />
      </div>
      {shouldShowFooter ? (
        <div className="border-border flex h-6 items-center gap-2 border-t px-2.5">
          <Skeleton className="h-3 w-3 shrink-0 rounded-xs" />
          <Skeleton className="ml-auto h-3 w-12 shrink-0 rounded-sm" />
        </div>
      ) : null}
    </div>
  );
}
