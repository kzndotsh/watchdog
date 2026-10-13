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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@watchdog/ui/components/dropdown-menu";

/** Presentational: AppAction[] → DropdownMenu items. */
export function DropdownActionItems({
  actions,
}: {
  actions: readonly AppAction[];
}) {
  const items = filterActionsForSurface(actions, "dropdown");
  return items.map((action, index) => {
    const prev = items[index - 1];
    return (
      <Fragment key={action.id}>
        {shouldSeparateActions(prev, action) ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          variant={action.isDestructive ? "destructive" : "default"}
          disabled={action.disabled}
          onClick={() => {
            action.run();
          }}
        >
          <ActionIcon action={action} />
          <span>{action.label}</span>
          {actionChord(action) ? (
            <DropdownMenuShortcut className="tracking-normal">
              <ActionShortcutChord
                chord={actionChord(action) ?? ""}
                kbdClassName={MENU_KBD_CLASS}
              />
            </DropdownMenuShortcut>
          ) : null}
        </DropdownMenuItem>
      </Fragment>
    );
  });
}
