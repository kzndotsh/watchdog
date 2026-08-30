import { cn } from "@/lib/utils";
import { CHIP_SIZE_CLASS } from "@/shared/ui/detail-status-chip";
import {
  ENTITY_NODE_SHELL_CLASS,
} from "@/shared/ui/graph/entity-node-chrome";
import { kindBorder } from "@/shared/ui/graph/graph-styles";
import { Skeleton } from "@/shared/ui/shadcn/skeleton";
import type { EntityKind } from "@watchdog/schemas";

/** Shape-matched skeleton for {@link EntityNode} — same chrome, pulsing placeholders. */
export function EntityNodeSkeleton({
  className,
  kind = "org",
}: {
  className?: string;
  kind?: EntityKind;
}) {
  return (
    <div
      className={cn(ENTITY_NODE_SHELL_CLASS, className)}
      style={{ borderColor: kindBorder(kind) }}
      data-graph-node-skeleton=""
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-[5.5rem] max-w-full rounded-sm" />
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Skeleton
              className={cn(CHIP_SIZE_CLASS.sm, "w-[3.25rem] shrink-0")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
