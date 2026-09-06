import { Fragment } from "react";

import { cn } from "@/lib/utils";
import {
  filterActionsForSurface,
  shouldSeparateActions,
  type AppAction,
} from "@/shared/lib/app-action";
import { modKeyLabel } from "@/shared/lib/hotkeys";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "@/shared/ui/shadcn/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/shared/ui/shadcn/dropdown-menu";
import { Kbd, KbdGroup } from "@/shared/ui/shadcn/kbd";

/** Dense keys inside menus / command items. */
export const MENU_KBD_CLASS = "h-4 min-w-4 px-1 text-label-meta-sm";

/** Catalog chord (`Mod+K`, `?`) as `Kbd` / `KbdGroup`. */
export function ActionShortcutChord({
  chord,
  className,
  kbdClassName,
}: {
  chord: string;
  className?: string;
  kbdClassName?: string;
}) {
  if (chord.startsWith("Mod+")) {
    const rest = chord.slice("Mod+".length);
    return (
      <KbdGroup className={className}>
        <Kbd className={kbdClassName}>{modKeyLabel()}</Kbd>
        <Kbd className={kbdClassName}>{rest}</Kbd>
      </KbdGroup>
    );
  }
  return <Kbd className={cn(kbdClassName, className)}>{chord}</Kbd>;
}

function ActionIcon({ action }: { action: AppAction }) {
  if (!action.icon) return null;
  const Icon = action.icon;
  return <Icon />;
}

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
          variant={action.destructive ? "destructive" : "default"}
          disabled={action.disabled}
          onClick={() => {
            action.run();
          }}
        >
          <ActionIcon action={action} />
          <span>{action.label}</span>
          {action.shortcut ? (
            <DropdownMenuShortcut className="tracking-normal">
              <ActionShortcutChord
                chord={action.shortcut}
                kbdClassName={MENU_KBD_CLASS}
              />
            </DropdownMenuShortcut>
          ) : null}
        </DropdownMenuItem>
      </Fragment>
    );
  });
}

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
          {action.shortcut ? (
            <ContextMenuShortcut className="tracking-normal">
              <ActionShortcutChord
                chord={action.shortcut}
                kbdClassName={MENU_KBD_CLASS}
              />
            </ContextMenuShortcut>
          ) : null}
        </ContextMenuItem>
      </Fragment>
    );
  });
}
