import type { AppAction } from "@/shared/lib/app-action";
import { cn } from "@/lib/utils";
import { kindBorder } from "@/shared/ui/graph/graph-styles";
import { ENTITY_NODE_SHELL_CLASS } from "@/shared/ui/graph/entity-node-chrome";
import type { EntityNodeData } from "@/shared/ui/graph/types";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { KindBadge } from "@/shared/ui/vocab";

export function EntityNode({
  data,
  selected = false,
  actions,
}: {
  data: EntityNodeData;
  selected?: boolean;
  actions?: readonly AppAction[];
}) {
  const border = kindBorder(data.kind);

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
        {actions && actions.length > 0 ? (
          <RowActionsMenu
            label="Node actions"
            actions={actions}
            className="opacity-100"
          />
        ) : null}
      </div>
    </div>
  );
}
