import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  filterActionsForSurface,
  type AppAction,
} from "@/shared/lib/app-action";
import { ActionsContextMenu } from "@/shared/ui/actions-context-menu";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";

/** ContextMenu shell + trailing ⋯ for a target AppAction list. */
export function TargetActionsHost({
  actions,
  label,
  className,
  children,
}: {
  actions: readonly AppAction[];
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const dropdownActions = filterActionsForSurface(actions, "dropdown");
  const body = (
    <>
      {children}
      {dropdownActions.length > 0 ? (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stop ⋯ pointer from selecting/dragging the host row
        <div
          className="shrink-0 self-start"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <RowActionsMenu label={label} actions={dropdownActions} />
        </div>
      ) : null}
    </>
  );

  if (actions.length === 0) {
    return <div className={className}>{body}</div>;
  }

  return (
    <ActionsContextMenu
      actions={actions}
      trigger={<div className={cn(className)} />}
    >
      {body}
    </ActionsContextMenu>
  );
}
