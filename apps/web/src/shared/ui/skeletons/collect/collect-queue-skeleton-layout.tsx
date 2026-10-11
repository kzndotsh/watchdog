import { cn } from "@/lib/utils";
import { CHIP_SIZE_CLASS } from "@/shared/ui/chip";
import { QueueDayGroup } from "@/shared/ui/queue-day-group";
import { QueueRowMeta } from "@/shared/ui/queue-row-meta";
import { QueueRowTitle } from "@/shared/ui/queue-row-title";
import { COLLECT_QUEUE_SKELETON_ROW_COUNT } from "@/shared/ui/skeletons/constants";
import { Skeleton } from "@watchdog/ui/components/skeleton";

function splitCollectQueueRowsByDay(rows: number): number[] {
  if (rows <= 4) return [rows];
  const first = Math.ceil(rows * 0.6);
  return [first, rows - first];
}

/** One Collect queue row — uses QueueRow title/meta chrome from collect-queue-list. */
function CollectQueueRowSkeleton({
  showRecipeChip = false,
  showHint = true,
}: {
  showRecipeChip?: boolean;
  showHint?: boolean;
}) {
  return (
    <div
      data-slot="collect-queue-row-skeleton"
      className="relative flex w-full min-w-0 flex-nowrap items-start gap-2 px-3 py-2 text-left"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <QueueRowTitle>
            <Skeleton className="inline-block h-3 max-w-[55%] min-w-0 basis-32 align-middle" />
          </QueueRowTitle>
          <Skeleton className={cn(CHIP_SIZE_CLASS.md, "w-14 shrink-0")} />
          {showRecipeChip ? (
            <Skeleton className={cn(CHIP_SIZE_CLASS.md, "w-9 shrink-0")} />
          ) : null}
        </div>
        {showHint ? (
          <span className="text-foreground/70 truncate text-xs">
            <Skeleton className="inline-block h-3 w-28 max-w-[70%] align-middle" />
          </span>
        ) : null}
        <QueueRowMeta>
          <Skeleton className="inline-block h-3 w-14 align-middle tabular-nums" />
          <span aria-hidden>·</span>
          <Skeleton className="inline-block h-3 w-12 align-middle" />
          <span aria-hidden>·</span>
          <Skeleton
            className={cn(CHIP_SIZE_CLASS.md, "w-[4.5rem] shrink-0 opacity-80")}
          />
        </QueueRowMeta>
      </span>
      <span className="mt-0.5 flex shrink-0 items-center self-start">
        <Skeleton className="size-2 shrink-0 rounded-full" />
      </span>
    </div>
  );
}

/** Collect queue row layout — day groups + row shape matched to CollectQueueList. */
export function CollectQueueSkeletonLayout({
  rows = COLLECT_QUEUE_SKELETON_ROW_COUNT,
  /** Wrap rows in `<li>` when the parent is a list; otherwise use `<div>`. */
  asListItem = true,
}: {
  rows?: number;
  asListItem?: boolean;
}) {
  const daySplits = splitCollectQueueRowsByDay(rows);
  let rowIndex = 0;

  return (
    <>
      {daySplits.map((dayRows, dayIndex) => (
        <QueueDayGroup
          key={dayIndex}
          headerVariant="panel"
          label={<Skeleton className="inline-block h-3 w-20 align-middle" />}
        >
          {Array.from({ length: dayRows }).map((_, itemIndex) => {
            const index = rowIndex;
            rowIndex += 1;
            const row = (
              <CollectQueueRowSkeleton
                showRecipeChip={index % 4 === 1}
                showHint={index % 3 !== 2}
              />
            );
            if (asListItem) {
              return <li key={`${dayIndex}-${itemIndex}`}>{row}</li>;
            }
            return <div key={`${dayIndex}-${itemIndex}`}>{row}</div>;
          })}
        </QueueDayGroup>
      ))}
    </>
  );
}
