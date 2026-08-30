import { MoreHorizontalIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { kindBorder } from "@/shared/ui/graph/graph-styles";
import { ENTITY_NODE_SHELL_CLASS } from "@/shared/ui/graph/entity-node-chrome";
import type { EntityNodeData } from "@/shared/ui/graph/types";
import { Button } from "@/shared/ui/shadcn/button";
import { KindBadge } from "@/shared/ui/vocab";

export function EntityNode({
  data,
  selected = false,
}: {
  data: EntityNodeData;
  selected?: boolean;
}) {
  const border = kindBorder(data.kind);
  const showMenu = data.showMenu === true;

  return (
    <div
      className={cn(
        ENTITY_NODE_SHELL_CLASS,
        selected && "ring-ring ring-offset-background ring-2 ring-offset-1",
        data.isCenter && "shadow-md"
      )}
      style={{ borderColor: border }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm leading-snug font-medium">
            {data.label}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <KindBadge kind={data.kind} className="text-chip" />
          </div>
        </div>
        {showMenu ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="size-6 shrink-0"
            aria-label="Node actions"
            data-entity-menu=""
          >
            <MoreHorizontalIcon className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
