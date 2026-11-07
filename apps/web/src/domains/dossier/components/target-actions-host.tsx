import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  filterActionsForSurface,
  type AppAction,
} from "@/shared/lib/app-action";
import { ActionsContextMenu } from "@/shared/ui/actions-context-menu";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";

type TargetActionsHostProps = {
  actions: readonly AppAction[];
  label: string;
  className?: string;
  /** Extra controls placed before the ⋯ menu (a row's history). */
  trailing?: ReactNode;
  children: ReactNode;
};

/** ContextMenu shell + trailing ⋯ for a target AppAction list. */
export function TargetActionsHost({
  actions,
  label,
  className,
  trailing,
  children,
}: TargetActionsHostProps) {
  const dropdownActions = filterActionsForSurface(actions, "dropdown");
  const body = (
    <>
      {children}
      {dropdownActions.length > 0 || trailing !== undefined ? (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stop ⋯ pointer from selecting/dragging the host row
        <div
          className="flex shrink-0 items-center self-start"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {trailing}
          {dropdownActions.length > 0 ? (
            <RowActionsMenu label={label} actions={dropdownActions} />
          ) : null}
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
