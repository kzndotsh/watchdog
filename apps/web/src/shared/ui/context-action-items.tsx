import { Fragment } from "react";

import {
  actionChord,
  filterActionsForSurface,
  shouldSeparateActions,
  type AppAction,
} from "@/shared/lib/app-action";
import { ActionIcon } from "@/shared/ui/action-icon";
import {
  ActionShortcutChord,
  MENU_KBD_CLASS,
} from "@/shared/ui/action-shortcut-chord";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "@watchdog/ui/components/context-menu";

/** Presentational: AppAction[] → ContextMenu items. */
export function ContextActionItems({
  actions,
}: {
  actions: readonly AppAction[];
}) {
  const items = filterActionsForSurface(actions, "context");
  return items.map((action, index) => {
    const prev = items[index - 1];
    return (
      <Fragment key={action.id}>
        {shouldSeparateActions(prev, action) ? <ContextMenuSeparator /> : null}
        <ContextMenuItem
          variant={action.destructive ? "destructive" : "default"}
          disabled={action.disabled}
          onClick={() => {
            action.run();
          }}
        >
          <ActionIcon action={action} />
          <span>{action.label}</span>
          {actionChord(action) ? (
            <ContextMenuShortcut className="tracking-normal">
              <ActionShortcutChord
                chord={actionChord(action) ?? ""}
                kbdClassName={MENU_KBD_CLASS}
              />
            </ContextMenuShortcut>
          ) : null}
        </ContextMenuItem>
      </Fragment>
    );
  });
}
