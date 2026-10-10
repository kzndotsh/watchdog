import type { LucideIcon } from "lucide-react";

import { hotkeyDef, type HotkeyId } from "@/shared/lib/hotkeys";

export type AppActionSurface = "context" | "dropdown" | "palette";

export type AppActionGroup = "target" | "page" | "app";

/** Shared by ContextMenu, ⋯ DropdownMenu, and palette Commands. */
export interface AppAction {
  id: string;
  label: string;
  group: AppActionGroup;
  run: () => void;
  icon?: LucideIcon;
  /** Registry id in `HOTKEYS`; the chord shown beside the action derives from it. */
  hotkey?: HotkeyId;
  destructive?: boolean;
  disabled?: boolean;
  keywords?: string;
  /** Defaults: target → context+dropdown; page/app → context+palette. */
  surfaces?: readonly AppActionSurface[];
}

const DEFAULT_SURFACES: Record<AppActionGroup, readonly AppActionSurface[]> = {
  target: ["context", "dropdown"],
  page: ["context", "palette"],
  app: ["context", "palette"],
};

/** Display chord (`Mod+K`, `?`) of the action's registry hotkey, if any. */
export function actionChord(action: AppAction): string | undefined {
  return action.hotkey === undefined
    ? undefined
    : hotkeyDef(action.hotkey).chord;
}

export function actionSurfaces(action: AppAction): readonly AppActionSurface[] {
  return action.surfaces ?? DEFAULT_SURFACES[action.group];
}

export function actionShowsOn(
  action: AppAction,
  surface: AppActionSurface
): boolean {
  return actionSurfaces(action).includes(surface);
}

export function filterActionsForSurface(
  actions: readonly AppAction[],
  surface: AppActionSurface
): AppAction[] {
  return actions.filter((action) => actionShowsOn(action, surface));
}

/** Separator between groups, or before the first destructive in a run. */
export function shouldSeparateActions(
  prev: AppAction | undefined,
  next: AppAction
): boolean {
  if (!prev) return false;
  if (prev.group !== next.group) return true;
  if (!prev.destructive && next.destructive) return true;
  return false;
}

export function mergeActionLayers(
  target: readonly AppAction[],
  page: readonly AppAction[] = [],
  app: readonly AppAction[] = []
): AppAction[] {
  return [...target, ...page, ...app];
}
