import type { ReactElement, ReactNode } from "react";

import type { AppAction } from "@/shared/lib/app-action";
import { skipEditableContextMenu } from "@/shared/lib/skip-editable-context-menu";
import { ContextActionItems } from "@/shared/ui/action-list";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/shared/ui/shadcn/context-menu";

/** ContextMenu with `render` trigger + action list; skips editables. */
export function ActionsContextMenu({
  actions,
  trigger,
  children,
}: {
  actions: readonly AppAction[];
  trigger: ReactElement;
  children?: ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={trigger}
        onContextMenuCapture={skipEditableContextMenu}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextActionItems actions={actions} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
