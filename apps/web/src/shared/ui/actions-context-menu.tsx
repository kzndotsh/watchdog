import type { ReactElement, ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "#ui/components/context-menu";
import type { AppAction } from "@/shared/lib/app-action";
import { skipEditableContextMenu } from "@/shared/lib/skip-editable-context-menu";
import { ContextActionItems } from "@/shared/ui/context-action-items";

type ActionsContextMenuProps = {
  actions: readonly AppAction[];
  trigger: ReactElement;
  children?: ReactNode;
};

/** ContextMenu with `render` trigger + action list; skips editables. */
export function ActionsContextMenu({
  actions,
  trigger,
  children,
}: ActionsContextMenuProps) {
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
